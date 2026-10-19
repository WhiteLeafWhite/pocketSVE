# PocketSVE

已根据 `apks/kdyzs_1.2.0.apk` 重建离线对战界面、主战者选择和 NFC 原卡读取流程。

- 最新安装包：`dist/pocketSVE-v0.4.0-debug.apk`（新增皇家护卫洛菈米亚、自定义背景及 NFC 文本卡支持）。
- [给洛菈米亚写一张 NFC 卡](docs/NFC_WRITING.md)。
- [功能说明、资源覆盖与验证范围](docs/REPLICA.md)。
- [构建与 NFC 协议测试](docs/BUILD_ANDROID.md)。
- 前端与原生源码：`app/src/main`。

```powershell
# 构建可安装 APK
.\scripts\Build-Android.ps1

# 离线测试
. .\scripts\Enter-ReverseEnv.ps1
node --test tests\core.test.cjs
.\scripts\Test-NfcProtocol.ps1
```

0.3.0 已在 Android 15 模拟器安装运行并验证语音播放；当前尚未连接手机，实体 NFC 卡和 Android 实机运行待验证。

## Android 逆向环境

按 [REA 中文说明](https://github.com/morluto/rea/blob/main/docs/readme/README_zh.md)配置，工具安装在本项目的 `.tools` 目录。

## 已安装

| 工具 | 版本 | 用途 |
| --- | --- | --- |
| REA | 6.7.0 | CLI 与 Codex MCP 分析接口 |
| Node.js / npm | 24.22.0 / 11.19.1 | REA 运行环境 |
| Temurin JDK | 21.0.12.1+1 | Java 编译器与 JADX 运行环境 |
| JADX headless MCP | 0.7.1 | APK 清单、类、方法和引用分析 |
| Apktool | 3.0.3 | Android 资源解码与重建 |
| Android Platform Tools | 37.0.1 | ADB 设备连接、日志和 APK 提取 |

下载地址、版本和官方校验值保存在 `scripts/tools.lock.json`。Node.js、JDK、JADX 和 Apktool 已核对 SHA-256；Platform Tools 已核对 Google SDK 仓库公布的 SHA-1。npm 安装时禁用了依赖生命周期脚本。

## 使用

重启 Codex，使已注册的 REA MCP 和配套技能加载到新会话。然后把目标 APK 放到 `Z:\code\pocketSVE\apks`，告诉 Codex 文件路径和希望分析或修复的功能。

也可以在项目目录的 PowerShell 中直接执行：

```powershell
# 激活当前 PowerShell 会话的工具路径和环境变量
. .\scripts\Enter-ReverseEnv.ps1

# 查看包信息、检索类、反编译方法
rea inspect-android-package '.\apks\target.apk'
rea search-android-classes '.\apks\target.apk' MainActivity
rea inspect-android-class '.\apks\target.apk' com.example.MainActivity
rea inspect-android-method '.\apks\target.apk' com.example.MainActivity onCreate

# 读取资源，或将资源与 smali 解包到新目录
rea decode-android-resources '.\apks\target.apk'
apktool d '.\apks\target.apk' -o '.\analysis\target-decoded'

# 设备需开启 USB 调试，并在设备上接受连接授权
adb devices -l
```

无需激活环境也可以使用项目入口：

```powershell
.\rea.ps1 inspect-android-package '.\apks\target.apk' --json
```

真实包名和类名应以目标 APK 的检查结果为准。以上工具提供代码与资源的静态分析；设备运行调试需要连接真机或已有模拟器。若后续需要反编译原生 `.so` 库，再为该目标配置 Ghidra 等原生分析引擎。

## Codex 接入

- MCP 配置：`C:\Users\zk\.codex\config.toml` 的 `mcp_servers.rea`。
- 启动器使用项目中 Node.js 和 REA 的绝对路径，Java、JADX、Apktool 和 ADB 路径均已写入该 MCP 的环境变量。
- 配套技能：`C:\Users\zk\.agents\skills\reverse-engineer-anything`。
- 原配置备份：`C:\Users\zk\.codex\config.toml.rea.backup`。
- 补充 Android 工具路径前的备份：`C:\Users\zk\.codex\config.toml.rea.android.backup`。

因此请保留当前项目路径。工具路径只在激活的 PowerShell 会话及 REA MCP 内设置。

Codex 的 Windows 沙箱会限制用户目录和原生进程操作；本次实际分析验证已在正常用户权限下通过。遇到对应权限错误时，需要允许具体分析命令在沙箱外运行。

## 验证结果

2026-10-19 使用 REA 官方测试样例 Appium ApiDemos 6.0.18 完成以下检查：

- APK SHA-256 与 REA 固定值一致。
- 成功读取包名 `io.appium.android.apis`、权限、清单和 2,876 个类。
- 成功反编译 `ApiDemos.onCreate` 方法。
- 成功通过 Apktool 解码资源。
- ADB 与 Apktool 客户端探测通过。
- 独立 MCP stdio 握手、207 个工具的发现及 ADB / Apktool 工具调用通过。
- `rea doctor --client codex --provider jadx --skill --json` 返回 `healthy: true`。

本次验证未连接设备，未执行测试 APK。摘要在 `analysis/environment-check.json`，完整验证记录位于 `.tools/metadata/verify-*.json`。

## 维护

```powershell
# 按已固定版本重新安装工具；需要联网
.\scripts\Install-ReverseTools.ps1

# 检查所选 Android 环境和 Codex 注册；正常用户权限运行
.\rea.ps1 doctor --client codex --provider jadx --skill --json

# 检查 MCP 实际启动与工具调用
. .\scripts\Enter-ReverseEnv.ps1
node .\scripts\Verify-ReaMcp.mjs
```

升级时应先核对官方版本与校验值，再更新锁定文件和 Codex 注册。

参考：[REA Android 配置](https://github.com/morluto/rea/blob/main/docs/android-analysis.md)、[资源分析](https://github.com/morluto/rea/blob/main/docs/apktool-resource-analysis.md)、[ADB 用法](https://github.com/morluto/rea/blob/main/docs/adb-device-analysis.md)、[Codex MCP 配置](https://learn.chatgpt.com/docs/extend/mcp?surface=cli)。
