<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## App 内链接跳转规范

- KidLoop App 内的所有链接跳转必须始终留在 App 内，不得唤起 Safari、Chrome 或其他外部浏览器。
- 站内页面使用 App 内导航；外部网页、地图链接及图片或文件预览使用 App 内浏览或预览界面，并提供返回或关闭入口。
- 新增或修改链接时，必须同时检查普通链接、`target="_blank"`、`window.open` 和重定向行为。无法在 App 内打开时，应在 App 内提示，不得自动回退到外部浏览器。
- 验收须覆盖 iPhone App 内的实际跳转和返回流程，不能只以桌面浏览器测试代替。
- 该规范属于已确认要求，详见 `PROJECT_OVERVIEW.md` 和 `docs/architecture.md`；记录规范不代表现有跳转已全部改造完成。
