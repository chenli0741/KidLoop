# 公司自带 Gmail：平台配置与复用

2026-09-16。新版本采用每家公司自行授权 Gmail，取代平台统一 Resend 发件人。普通用户只需连接、选账号、授权；平台运营者完成以下一次性准备。

## 平台开通：四步

1. 在 Google Cloud 创建或选用本应用项目，启用 **Gmail API**。Google Auth Platform 的受众选择 External；填写应用名称、支持邮箱、应用首页和隐私政策网址。
2. 添加权限 `openid`、`email`、`https://www.googleapis.com/auth/gmail.send`；创建类型为 **Web application** 的 OAuth client。授权重定向 URI 必须精确填写：`https://kid-loop.vercel.app/api/mail/google/callback`。正式域名变化时，环境变量和 Google 配置同步改。不要使用每次变化的预览部署网址。
3. 服务端配置下面四项；本机使用 `.env.local`，线上使用部署环境变量。公司用户看不到也不填写这些配置。将应用数据库迁移到 057 后再发布依赖它的新代码。
4. 对公众开放前完成 Google 要求的品牌/域名与敏感权限审核，按控制台要求提供用途说明、隐私政策和演示。Testing 状态仅供列入名单的测试用户，含 Gmail 权限的刷新令牌通常七天失效，不能作为公众长期运行配置。准备代码不代表 Google 已批准。

| 服务端变量 | 内容 |
| --- | --- |
| `MAIL_GOOGLE_CLIENT_ID` | 本应用 Web OAuth client ID |
| `MAIL_GOOGLE_CLIENT_SECRET` | 对应 client secret |
| `MAIL_TOKEN_ENCRYPTION_KEY` | 32 随机字节的 64 位十六进制字符串，各应用独立生成并安全备份 |
| `KIDLOOP_APP_URL` | 当前应用根网址，正式环境 HTTPS，不带路径 |

生成加密密钥时直接安全保存，不粘贴到聊天、工单或 Git。可使用 `openssl rand -hex 32`；它会把密钥输出到当前终端，确保终端不在录屏或共享。密钥改变会使旧令牌无法解密，需重新连接；正常发布保持密钥不变。

应用可以不商业收费，Google 仍可能要求审核公开使用的敏感权限。此实现没有额外邮件服务商订阅；Gmail 自身额度、账号政策和风控仍适用，多个应用或公司共用一个 Gmail 时不能把额度当成各自独立。平台不承诺无限发送。

## 页面和业务

- 公司管理：连接 Gmail、显示地址、重新连接或换邮箱、断开、最近 20 条发送元数据。
- 只有当前公司的 ADMIN 工作人员可配置和使用公司连接。连接邮箱允许不同于 KidLoop 登录邮箱，因为公司可能使用公共发件邮箱。
- 司机、家长接收邀请无需 Gmail 授权或做邮箱设置，任何可收信地址均可。
- 更换连接须完成新授权才覆盖原邮箱；取消或失败保留旧邮箱。
- 授权失效提示重新连接；Google 发送限额提示稍后重试；未知投递不自动重发。
- 已发送表示 Gmail API 接受请求，不表示对方收件箱送达；日志不保存邮件正文、邀请令牌或授权凭证。
- 公司断开立即删除本系统该公司的凭证并阻止后续发送；已经开始的网络请求可能完成，不会撤回已发邮件。Google 账号页全局撤销可能影响同一 Gmail 连接的其他公司。

## iPhone App

`KidLoopMailAuthPlugin` 使用 `ASWebAuthenticationSession` 系统授权窗口，带取消入口；不在 WKWebView 内尝试 Google 登录，不启动外部 Safari，不降级外跳。Google 回调仍到上述 HTTPS 服务端地址，暂存加密授权结果后通过 `kidloop-mail://complete` 返回窗口。原 App 内的已登录会话和独立 proof 完成绑定。

需要重新编译安装包含插件的新 iPhone App。旧安装包检测不到插件时会在 App 内提示更新；公司也可在电脑网页完成连接。没有运行 iPhone 编译或设备验收，不能把桥接代码视为已验证原生功能。

## 复制清单

- 通用模块：`src/lib/connected-mail/`（OAuth provider、加密、数据库流程、发送与日志）。
- 数据库：`db/migrations/057_connected_mail.sql`，三张无 KidLoop 业务外键的 mail 表。
- 宿主适配器：`src/lib/company-mail/`，替换本项目身份与权限函数。
- Web 接入：`src/app/organizations/mail-actions.ts`、`src/app/api/mail/google/callback/route.ts`、`src/app/organizations/mail/complete/`、两个 mail UI 组件。
- iOS 可选：`src/lib/native-mail-auth.ts`、`KidLoopMailAuthPlugin.swift` 及工程注册。另一 App 使用独立回调 scheme，服务端回调和客户端验证同步替换。
- 业务示例：`src/lib/invitation-email.ts`，只包含邀请内容与稳定 message key。

后续支持其他邮箱服务商时扩展 `MailProvider`、OAuth 凭证与数据库 provider 约束；本版只实现 Gmail。通用模块适用于 Node/PostgreSQL，其他语言或数据库需重写适配器。

## 当前交付状态

代码与配置模板已准备。本轮按用户要求不执行测试、lint、类型检查、构建、真实邮件发送、浏览器或原生验收；Google 项目配置与审核未完成。057 已于 2026-09-16 20:15 UTC 在生产执行并重新读取确认已记录。执行前备份并逐表核对原有 55 张表、1,070 条记录无变化，含 5 个账号和 1 家公司；只新增三张 mail 表和迁移记录。备份与报告在 `.local-data/migrations/production057-2026-09-16T20-15-53.015Z/`。这是迁移核对，不代表 Gmail 链路测试。

## 官方参考

- [Google Web OAuth：离线授权、刷新和回调](https://developers.google.com/identity/protocols/oauth2/web-server)
- [Gmail 最小权限](https://developers.google.com/workspace/gmail/api/auth/scopes)
- [Gmail API 发送消息](https://developers.google.com/workspace/gmail/api/guides/sending)
- [Google 敏感权限审核](https://developers.google.com/identity/protocols/oauth2/production-readiness/sensitive-scope-verification)
- [Google API 用户数据政策](https://developers.google.com/terms/api-services-user-data-policy)
- [Apple 系统 Web 授权窗口](https://developer.apple.com/documentation/authenticationservices/authenticating-a-user-through-a-web-service)
