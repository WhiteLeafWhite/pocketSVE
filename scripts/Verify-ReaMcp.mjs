import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(path.join(root, '.tools/rea/package.json'));
const { parse } = require('smol-toml');
const { Client } = require('@modelcontextprotocol/client');
const { StdioClientTransport } = require('@modelcontextprotocol/client/stdio');
const config = parse(fs.readFileSync(path.join(os.homedir(), '.codex/config.toml'), 'utf8')).mcp_servers.rea;
const client = new Client({ name: 'pocketSVE-environment-check', version: '1.0.0' });
const transport = new StdioClientTransport({
  command: config.command,
  args: config.args,
  env: config.env,
  cwd: root,
  stderr: 'pipe',
});
let diagnostics = '';
transport.stderr?.on('data', chunk => { diagnostics += chunk.toString(); });
const report = { checkedAt: new Date().toISOString(), tools: [], checks: [] };
try {
  await client.connect(transport, { timeout: 30000 });
  const catalog = await client.listTools();
  report.toolCount = catalog.tools.length;
  const names = new Set(catalog.tools.map(tool => tool.name));
  const selected = ['inspect_android_package', 'search_android_classes', 'inspect_android_method', 'decode_android_resources', 'inspect_adb_client', 'inspect_apktool_client'];
  for (const name of selected) {
    if (!names.has(name)) throw new Error(`MCP tool missing: ${name}`);
    report.tools.push(name);
  }
  for (const name of ['inspect_adb_client', 'inspect_apktool_client']) {
    const result = await client.callTool({ name, arguments: {} }, { timeout: 30000 });
    if (result.isError) throw new Error(`${name} failed: ${JSON.stringify(result.content)}`);
    report.checks.push({ tool: name, passed: true });
  }
  report.passed = true;
} catch (error) {
  report.passed = false;
  report.error = error.message;
  if (diagnostics) report.diagnostics = diagnostics.slice(-4000);
  process.exitCode = 1;
} finally {
  await client.close();
  const destination = path.join(root, '.tools/metadata/verify-mcp.json');
  fs.writeFileSync(destination, JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(report, null, 2));
}
