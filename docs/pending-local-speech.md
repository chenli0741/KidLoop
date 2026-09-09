# 待办：本机语音录入

用户要求已确认，2026-09-08 暂停实现，先完成 Pickup 拍照辅助。

- iPhone App 使用苹果本机语音转文字；必须检查 supportsOnDeviceRecognition，并强制 requiresOnDeviceRecognition。
- 不上传录音，不回退到云端转写。不支持时提示文字输入。
- Web 端移除 KidLoop 自带录音入口及音频上传路径，保留文字输入。系统键盘听写由系统提供，KidLoop 不承诺其内部一定离线。
- 已识别文字由用户查看、修改并提交；文字生成调度方案是另一条现有业务流程，不等同于上传录音。
- 当前仍是 OpenAI 音频转写 API，尚未改为本机实现；不要报告已经完成。
