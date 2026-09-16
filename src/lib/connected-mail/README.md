# Connected Mail：可复制的 Gmail 发信模块

本目录是 Node.js + PostgreSQL 的通用实现，不依赖 Next.js、KidLoop 账号或接送业务。依赖 Node 内置 crypto/fetch、`pg` 及其类型；不需要付费邮件中转服务。框架、数据库不同的系统仍需适配边界，不能承诺原封不动运行在任何语言上。

## 普通用户的操作

公司设置 → 连接 Gmail → 选择 Google 账号并允许发送 → 自动返回。

用户无需创建 Google Cloud 项目、购买企业邮箱、设置 SMTP、生成应用密码或配置 DNS。首次登录 Google 可能要求它自己的身份验证；平台无法绕过。邮件从所选邮箱发出，回复回原邮箱，不在应用内读取收件箱。

## 复制到下一个项目：四步

1. 复制本目录，并建 `057_connected_mail.sql` 中的三张表。文件编号可按目标项目调整；末尾 KidLoop 专属 `kidloop_runtime` 撤权语句改成目标项目的业务角色，普通业务/客户端不得直接访问授权表。
2. 复制 `src/lib/company-mail/` 作为适配器，只替换当前用户/所属公司、事务内权限检查、审计写入、环境变量入口。个人应用的 `ownerKey` 用用户标识，公司应用用公司标识；同一系统两种模式并存时加 `user:`/`company:` 前缀。绝不直接信任表单传来的 ownerKey。
3. 复制连接按钮、完成页、Server Actions 和 OAuth callback 路由，调整项目路径/样式。其他框架保留同样的 start → callback stage → authenticated finish 流程。原生 iOS 还需复制授权桥接并改应用回调 scheme。
4. 按 [平台配置说明](../../../../docs/connected-mail.md) 填 Google OAuth client、回调网址、服务端加密密钥。业务只调用 `send`，自己提供收件人、主题、正文、稳定消息键。

```ts
// 示意：所有 actor 值来自当前已验证会话；db 来自宿主应用。
const mail = createConnectedMail({
  database: { query: db.query, transaction: db.transaction },
  configuration: () => ({
    provider: googleMailProvider({ clientId, clientSecret, redirectUri }),
    vault: tokenVault(encryptionKey),
  }),
  actor: { ownerKey, actorId, sessionHash, contextKey },
  authorize: async client => { /* 必须重查账号、会话、所属公司、管理权限 */ },
  audit: async (client, action) => { /* 写入目标项目审计 */ },
});
await mail.send(`invitation:${invitation.id}`, {
  to: invitation.email,
  subject: '邀请加入',
  text: invitationText,
  messageId: `${invitation.id}@your-app.example`,
});
```

示例中的权限回调不能留空上线。KidLoop 实际实现见 `src/lib/company-mail/service.ts`。

## 接口

- `status()`：仅返回配置是否齐全、邮箱、版本、连接状态；不包含令牌。
- `start(native)`：生成 Google 地址、state、completion proof；web 只把 proof 放当前标签页 sessionStorage，原生放内存；proof 不进入任何 URL。
- `stageMailAuthorization(...)`：公共 OAuth 回调，交换授权码，暂存加密凭证；**不绑定邮箱**。
- `finish(state, proof)`：在原会话中重新验证 actor、公司、proof、连接版本后提交。回调网址泄露也不能凭 URL 完成绑定。
- `disconnect(revision)`：删除该 owner 的凭证及未完成授权。已发出/正在进行的外部请求无法撤回。
- `assertReady()`、`send(key, message)`、`history()`：发送准备、受控发送、最近 20 条发送元数据。

## 必须保留的边界

- state/PKCE/proof、十分钟有效期、单次回调、事务内授权、所属公司与会话绑定、连接 revision 比较不能删掉。
- 加密密钥 32 字节，各应用独立保存于服务端。刷新令牌、暂存授权、PKCE verifier 加密；不写日志、不传组件、不放 cookie 或浏览器永久存储。
- Google 只请求 `openid email gmail.send`。使用 userinfo 获取已验证邮箱，不调用需要读取权限的 Gmail profile/list 接口。
- 每次发送先刷新短期访问令牌，再重查权限和邮箱版本；刷新失败提示重新连接。无需后台定时刷新任务。
- 数据库唯一消息键防止并发重复发信。Google Gmail API 不提供本模块可用的 exactly-once 保证；超时、5xx、发送后数据库写入失败标记 UNKNOWN，不自动重发。Message-ID 不是 Gmail 的幂等承诺。
- 断开只删除本应用该 owner 的令牌，不调用 Google 全局 revoke（可能同时撤销同一 Gmail 在其他公司的授权）。用户可自行在 Google 账号管理中撤销整个应用。
- 成功连接/断开会清理该公司的未完成请求；过期请求在下一次 start 时删除。Google 撤权后在下一次发送时识别，不承诺即时 webhook 检测。
- 通用表只供服务端授权适配器访问；host 删除公司时需清理该 owner 的连接、流程和按其保留政策处理日志。

目前是未执行测试的参考实现；没有真实 Google 授权、投递或 iPhone 验收记录。复制不能代替目标项目的上线验收。
