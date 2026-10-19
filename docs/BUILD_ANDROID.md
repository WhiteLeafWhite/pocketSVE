# 构建 PocketSVE Android APK

当前版本 0.3.0，按原 APK 的 portrait 方向运行。交付文件为 `dist/pocketSVE-v0.3.0-debug.apk`；使用 `-OutputPath` 可保留版本化产物，默认输出仍为 `dist/pocketSVE-debug.apk`。

在项目根目录执行：

```powershell
.\scripts\Test-NfcProtocol.ps1
.\scripts\Build-Android.ps1
```

本版媒体回归检查使用已配置的 Node.js 和 Edge：`node scripts/Test-Media.mjs`；原对战/NFC 页面检查使用 `node scripts/Test-Ui.mjs`。前者实际解码播放本地音频并检查时间前进，验证骰子动画及暂停清理，不需要原应用账号或联网。

输出文件为 `dist/pocketSVE-debug.apk`。这是调试签名版本，包名 `io.pocketsve.app`，最低 Android 6.0（API 23），目标 API 35。NFC 硬件为可选项；没有 NFC 的设备仍可操作对战界面并手动选择主战者。

构建脚本使用 `.tools/java` 中的 JDK、`.tools/android/platforms/android-35` 和 `.tools/android/build-tools` 中的工具，依次完成资源打包、Java 编译、DEX 转换、ZIP 对齐和 APK 签名验证。不需要下载 Gradle 或应用运行依赖。也可通过 `-JavaHome`、`-AndroidSdk` 和 `-OutputPath` 指定路径。每次构建保留独立的 `build/android-*` 中间目录。

如果从源码压缩包开始，可使用已有 JDK 17+，并先运行 `scripts/Install-AndroidBuildTools.ps1` 获取官方 SDK 35 平台与构建工具，再通过 `Build-Android.ps1 -JavaHome '你的JDK目录'` 构建。没有 JDK 时，`scripts/Install-ReverseTools.ps1` 会安装本项目固定版本的 JDK 和逆向环境。下载脚本需要联网，应用运行和已有工具下的 APK 构建均可离线。

本机 Codex 受限沙箱会使 Android `aapt2` 资源工具异常退出，已通过在沙箱外运行构建解决。从普通 Windows PowerShell 运行上面的命令即可。

签名使用 `.tools/debug.keystore`，别名 `androiddebugkey`，调试密码 `android`。首次构建时自动创建。后续安装保留同一个 keystore，可直接覆盖升级。此签名仅用于当前测试 APK。

仓库同时提供常规 Android Gradle 工程元数据，可在已有 Android Studio / Gradle 环境导入；本次交付使用上面的 SDK 直接构建脚本，未验证 Gradle 构建。

## NFC 桥与验证范围

原生层只向本地打包网页提供 `PocketNfc.startScan()`、`stopScan()`、`getStatus()`、`openSettings()`、`vibrate()`，并发出 `pocket:nfc`、`pocket:nfc-status`、`pocket:nfc-error` 事件。应用没有网络权限，网页不能导航至外部页面。

原卡读取依据原版静态恢复的 NFC-A 协议实现：读取 UID、派生密码鉴权、只读卡页、三层 AES 校验。卡牌密码目录位于 `app/src/main/assets/data/nfc-cards.json`。只有 `tag.originalCard.verified === true` 的结果可作为已验证原卡。另保留只读 NDEF 记录，供前端识别自定义标签。原生层没有写卡命令。

`Test-NfcProtocol.ps1` 编译实际生产 Java 解码方法，使用 Python 独立实现生成的合成测试向量，验证读取页拼接、PWD_AUTH 密码派生、三层 AES、卡牌编号和错误 UID 拒绝。测试中仅将 Android Base64 API 替换为 JDK 等价实现，测试目录不会被打入 APK。

0.3.0 已在 Android 15（API 35、x86_64）模拟器安装运行，实际 WebView 页面和语音播放正常；0.2.0 已验证无 NFC 设备提示。当前没有连接 NFC 安卓真机；模拟器及离线测试不代表实体卡与手机 NFC 天线验证，连接设备后仍需检查实体卡扫描和真机显示。
