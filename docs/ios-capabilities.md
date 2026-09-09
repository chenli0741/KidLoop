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
