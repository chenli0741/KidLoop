# 司机行程通知与 Google 日历

2026-09-30。司机在 iPhone App 登录并允许通知后，设备令牌只绑定当前司机账号。当天有行程时，上午 09:00 发送一次摘要；每趟按第一个实际接人站点的计划时间提前一小时提醒。无行程不发送。点击通知只进入 KidLoop App 的当天行程页，退出登录会停用原账号的设备绑定。

司机周日程页可授权任意 Google 账号，授权邮箱不要求与 KidLoop 登录邮箱相同。系统仅请求 `openid`、`email` 和 `calendar.events`，把未来五周当前司机的行程写入主日历；排班变化或取消会更新或移除对应事件。断开连接删除本系统的刷新凭证并停止同步，已写入 Google 日历的事件保留。

生产环境需要：

- Google Cloud 启用 Google Calendar API，Web OAuth client 增加重定向 URI `https://kid-loop.vercel.app/api/calendar/google/callback`。
- `CALENDAR_GOOGLE_CLIENT_ID`、`CALENDAR_GOOGLE_CLIENT_SECRET`、`CALENDAR_TOKEN_ENCRYPTION_KEY`；可与公司 Gmail 使用同一 Web client，但权限审核必须覆盖 Calendar scope。
- Apple Developer 为 `com.globjoy.kidloop` 启用 Push Notifications，并配置 `APNS_KEY_ID`、`APNS_TEAM_ID`、`APNS_PRIVATE_KEY`、`APNS_BUNDLE_ID`。
- Vercel `CRON_SECRET`。现有团队是 Pro，可运行每分钟 cron；日历每 15 分钟同步一次，连接和手动操作后立即同步。

数据库迁移为 `064_driver_notifications_and_calendar.sql`。令牌与 OAuth 凭证不写入源码；Google 刷新凭证使用 AES-256-GCM 加密。通知投递按设备和提醒键去重，失败最多重试三次，APNs 返回设备已注销时停用令牌。

验收必须使用真实 iPhone：确认权限提示、09:00 有／无行程分支、提前一小时提醒、点击回到当天行程、退出后不再接收、换司机账号后重新绑定；Google 日历需验证不同邮箱授权、首次写入、时间变化、取消、换司机、断开和 App 内授权返回。
