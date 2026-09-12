# iPhone 原生能力与安装前检查

2026-09-08：已安装并通过 Capacitor 同步注册：

| 功能 | 原生依赖 / 配置 | 状态 |
| --- | --- | --- |
| 拍照、直接选择相册 | `@capacitor/camera` 8.2.4；相机、相册读取和保存用途说明 | 原生注册与现有图片接口就绪 |
| 当前位置 | `@capacitor/geolocation` 8.2.2；WhenInUse 和插件要求的 AlwaysAndWhenInUse 用途说明 | 原生 API 就绪；现有操作位置采集仍使用 WebView geolocation |
| App 内浏览 | `@capacitor/browser` 8.0.4；SFSafariViewController | 原生 API 就绪；不代表现有所有链接已改造 |
| 麦克风 | `NSMicrophoneUsageDescription` | 已配置 |
| 苹果语音识别 | `NSSpeechRecognitionUsageDescription` | 权限说明预置；本机语音桥接和录入 UI 改造仍见 `pending-local-speech.md` |

定位的 AlwaysAndWhenInUse 文案是 Geolocation 依赖要求，不开启后台定位，不请求持续追踪。iOS 授权仍在第一次使用对应功能时由用户选择；工程配置不能预先替用户授权。

安装前运行：

```sh
npm install
npm run ios:sync
npm run ios:open
```

`ios:sync` 自动执行 `scripts/check-ios-capabilities.mjs`，检查权限用途说明、生成的插件注册清单和 Swift Package 产品链接。也可单独运行 `npm run ios:check`。不要手工编辑被同步覆盖的 `CapApp-SPM/Package.swift` 或 `capacitor.config.json`。

已通过模拟器及 iPhone 真机目标的无签名编译（CODE_SIGNING_ALLOWED=NO），未生成已签名安装包。原生插件及权限变化必须重新编译安装 iPhone App；只推送网页不会更新手机里已有的原生壳。实际相册选择与系统授权弹窗仍需手机验收。

## 本机 OCR 接口

`KidLoopOCR` 自定义 Capacitor 插件在 `KidLoopBridgeViewController.capacitorDidLoad` 注册；SceneDelegate 和 storyboard 都使用该控制器。`DeviceVision.swift` 与插件源文件均纳入 Xcode 编译目标，不依赖第三方 OCR 服务。

Web 业务代码使用 `src/lib/native-ocr.ts`：

```ts
const capabilities = await nativeOCRCapabilities();
const result = await recognizeImageText(imageBlob, ['zh-Hans', 'en-US']);
// result.text / result.blocks[{text, confidence, box}] / result.languages
```

基于 Apple Vision 的 `VNRecognizeTextRequest`，按设备支持情况选择简中、繁中、英文，返回实际使用语言。文字框是已校正方向画面中的左上角归一化坐标。支持的本地图片经 Base64 桥接，限制 15 MB / 2400 万像素，每次只允许一个识别请求；不下载 URL、不存文件、不上传图片、无云端回退。不支持的语言组合和损坏图片明确报错。OCR 分析本身不需要额外系统权限，拍摄和相册选择沿用已配置权限。

本次提供原生 API 与 TypeScript 调用封装，没有另增 OCR 业务页面。macOS 上使用相同识别引擎的合成中英文图片测试通过（`tests/native-ocr.swift`），iPhone 真机目标无签名编译通过；不等于实机图像效果和授权弹窗验收。

Apple API reference: https://developer.apple.com/documentation/vision/vnrecognizetextrequest

## App Store 权限说明本地化（2026-09-11）

苹果对 1.0 (2) 的 Guideline 4 反馈指出：英文界面中相机和相册用途说明显示为中文。原生工程默认语言为英文，但 Info.plist 中的权限文案全部为中文。

- Info.plist 的 7 项权限用途说明统一使用英文作为回退文案，覆盖相机、相册读取、相册保存、麦克风、语音识别和两项定位权限。
- 新增 `en.lproj/InfoPlist.strings` 与 `zh-Hans.lproj/InfoPlist.strings`，并纳入 Xcode Resources。照片说明同时覆盖个人头像与接送身份确认所用的学生照片。
- 系统授权弹窗按 iOS 的 App 语言选择本地化，不跟随 Web 的 `kidloop_locale` Cookie 即时切换。英文审核设备应使用 English；中文资源仅供 iOS 选择简体中文时使用。
- 必须重新构建并上传新 build，网页部署无法修改已安装 App 的系统权限说明。此次不改变版本号；送审时使用 App Store Connect 中尚未使用且高于已提交版本的 build 号（被拒 build 为 2）。
- 送审前用英文 iPhone 和 iPad 兼容模式安装新包，重置对应授权或在全新测试环境中触发相册、相机弹窗，检查英文说明及允许、拒绝后的操作；模拟器不能代替真机拍照验证。另验证中文 App 语言下的说明。

依据：[Apple — Resolving the Privacy-Sensitive Data App Rejection](https://developer.apple.com/library/archive/qa/qa1937/_index.html)。

验证结果：`plutil -lint`、`npm run ios:check`、Release iOS Simulator 无签名构建通过；检查生成的 KidLoop.app，确认中英文资源各包含完整 7 项权限，英文资源与包内默认文案一致。尚未验证真机系统弹窗、生成签名包或上传送审。
