import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { isDeepStrictEqual } from 'node:util';
import { createRequire } from 'node:module';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(path.join(root, '.tools/rea/package.json'));
const { parse, stringify } = require('smol-toml');
const configPath = path.join(os.homedir(), '.codex/config.toml');
const original = fs.readFileSync(configPath, 'utf8');
const config = parse(original);
const current = config.mcp_servers?.rea;
if (!current) throw new Error('Run REA setup --client codex first.');
const updated = {
  ...current,
  env: {
    ...current.env,
    REA_APKTOOL_COMMAND: path.join(root, 'scripts/apktool.cmd'),
    REA_ADB_PATH: path.join(root, '.tools/android/platform-tools/adb.exe'),
  },
};
if (isDeepStrictEqual(current, updated)) {
  console.log(JSON.stringify({ status: 'aligned', configPath }));
  process.exit(0);
}
const headers = [...original.matchAll(/^\s*\[([^\]\r\n]+)\][^\r\n]*$/gm)];
const start = headers.findIndex(match => match[1] === 'mcp_servers.rea');
if (start < 0) throw new Error('Expected REA TOML table was not found.');
const end = headers.slice(start + 1).find(match => !match[1].startsWith('mcp_servers.rea.'))?.index ?? original.length;
const replacement = stringify({ mcp_servers: { rea: updated } }).trim();
const result = original.slice(0, headers[start].index) + replacement + '\n\n' + original.slice(end);
const expected = parse(original);
expected.mcp_servers.rea = parse(replacement).mcp_servers.rea;
if (!isDeepStrictEqual(parse(result), expected)) throw new Error('TOML verification failed.');
const plan = { configPath, addedEnvironment: ['REA_APKTOOL_COMMAND', 'REA_ADB_PATH'] };
if (!process.argv.includes('--apply')) {
  console.log(JSON.stringify({ status: 'planned', ...plan }));
  process.exit(0);
}
if (fs.readFileSync(configPath, 'utf8') !== original) throw new Error('Configuration changed concurrently.');
const backup = `${configPath}.rea.android.backup`;
if (!fs.existsSync(backup)) fs.copyFileSync(configPath, backup, fs.constants.COPYFILE_EXCL);
fs.writeFileSync(configPath, result);
if (!isDeepStrictEqual(parse(fs.readFileSync(configPath, 'utf8')), expected)) throw new Error(`Readback failed; restore ${backup}.`);
console.log(JSON.stringify({ status: 'configured', ...plan, backup }));
