# 行程学生照片放大

行程清单使用 StudentPhotoPreview，点击头像在 App 内弹窗显示完整照片（object-fit: contain），不会跳转外部浏览器。组件使用独立 CSS module，预览 portal 到 document.body，避免继承头像容器裁切。支持关闭按钮、遮罩和 Escape 关闭；关闭时先结束原生 dialog，再将焦点还给头像按钮。继续使用原来的鉴权图片 URL 和 Test 账号替代照片。

390px 浏览器组件验证：点击打开、366px 弹窗、完整图片比例、关闭与 Escape 返回。iPhone 原生 App 中的实际点按/返回仍待验收，浏览器测试不代表实机验收。改动未推送时线上仍保留普通图片。
