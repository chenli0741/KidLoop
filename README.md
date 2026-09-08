# KidLoop

KidLoop is a web-first operations system for after-school pickup and dropoff management.

The interface supports Simplified Chinese and English. Simplified Chinese is the default, and each user's selection is saved in a cookie.

## Implemented MVP

- Multiple vehicles with license plate, capacity, and availability state.
- Drivers and dated driver/vehicle shifts.
- School pickup details and after-school dropoff details.
- Student roster with photo, class, grade, age, destination, and parent contact.
- Trip planning with vehicle capacity, driver/vehicle overlap, and duplicate student checks.
- Driver pickup manifest with per-student pickup, dropoff, absent, and issue states.
- Automatic trip status updates and status history.
- Responsive desktop and mobile interfaces.
- Capacitor iPhone shell with a generated `KidLoop.xcodeproj` project.

## Local setup

Requirements:

- Node.js
- PostgreSQL
- `.env.local` containing a server-only `DATABASE_URL`

Install and prepare the database:

```bash
npm install
npm run db:migrate
```

Start the development server:

```bash
npm run dev
```

Then open [http://localhost:3010](http://localhost:3010).

## iPhone project

The Xcode project is located at `ios/App/KidLoop.xcodeproj`. It contains the `KidLoop` target and scheme and is configured for iPhone only with an iOS 15.0 minimum deployment target.

Sync the bundled shell and open Xcode:

```bash
npm run ios:sync
npm run ios:open
```

For local iPhone Simulator development, start Next.js and sync the shell to the local server:

```bash
npm run dev
CAPACITOR_SERVER_URL=http://127.0.0.1:3010 npm run ios:sync
npm run ios:open
```

Use the deployed HTTPS URL in `CAPACITOR_SERVER_URL` before creating a release build. Running `npm run ios:sync` without that variable restores the bundled fallback page.

## Verification

```bash
npm run typecheck
npm run lint
npm run build
```

## Documentation

- [Project requirements](PROJECT_OVERVIEW.md)
- [System architecture](docs/architecture.md)
- [Data model](docs/data-model.md)

## Role login and parent plans

Run the database migrations, then create the first administrator with `npm run auth:create-admin`. Supply `KIDLOOP_ADMIN_EMAIL`, `KIDLOOP_ADMIN_NAME` and `KIDLOOP_ADMIN_PASSWORD` through the environment. Passwords must contain 6–128 characters. The script refuses duplicate emails and never resets an existing account. Do not put passwords in source files or commits.

Sign in at `/login`. Administrators land on `/`, drivers on `/driver`, and parents on `/parent`. The administrator's Accounts page creates accounts, binds a driver or children, updates child bindings, disables accounts and resets passwords. There is no public self-registration. Parent access comes only from explicit child bindings.

The login form defaults to remembering the session for 30 days. Unchecking this option creates a browser-session cookie with a 12-hour server expiry. Successful remembered logins retain the last email for 180 days, including after sign-out; unremembered logins clear that hint. Password fields support the system password manager, and the app never writes passwords to cookies or browser storage.

Parents can browse dates, see their children's profiles and ride progress, and save daily absences or special-request notes. Absences work before scheduling and propagate to existing unpicked-up assignments. Canceling a parent absence does not undo a driver's manually recorded absence. All plan changes and propagated status changes retain their actor and history.

For local integration tests (temporary schemas are created and removed, and remote database hosts are rejected):

```bash
KIDLOOP_TEST_DATABASE_URL=postgresql://USER@localhost/postgres npm run test:roles
```

`node --env-file=.env.local --import tsx scripts/create-test-accounts.ts` creates one test account per role against the configured database, only when labelled test drivers and historical test-roster children exist. Passwords are written to `.local-data/test-accounts.md` with owner-only permissions; the script refuses to overwrite existing accounts or the credentials file.

## Resources and personal accounts

`/resources` combines fleet, schools and programs. System account administration moves to `/admin/accounts` and its navigation entry is desktop-only. All account administration actions still require ADMIN regardless of device. Legacy `/fleet`, `/locations`, and `/accounts` URLs redirect to the new locations.

The account menu contains personal information, password change, language and sign-out. Parents also get a child-information editor. `/profile` allows changes to the signed-in user's name, phone and email (email changes require the current password). Password changes revoke all sessions. `/parent/children` permits updates only to explicitly linked children and preserves school/class/program assignments. Apply migration `005_personal_profiles.sql` before using these pages.

Run local profile and ownership checks with `KIDLOOP_TEST_DATABASE_URL=postgresql://USER@localhost/postgres npm run test:profiles`.

### 接送设置

已确认业务要求见 [需求与实现边界](docs/confirmed-requirements.md)，详细实施记录见 [项目总览](PROJECT_OVERVIEW.md)。

管理员在 `/schedule` 维护学校学期、假期和年级接送时间（年级可多选），通过月历查看安排。在独立 `/routes` 规划固定多站线路，绑定学生、司机和车辆；保存及读取指定日期时自动生成每日任务，放假自动跳过，无需每天人工调度。改变线路司机影响未开始和后续任务；已执行记录保留。旧 `/schedule/dispatch` 跳转到线路管理。

启动前运行 `npm run db:migrate`，学校规则与固定线路涉及迁移 `006`、`008`、`009`。测试使用本机隔离数据库：

```sh
KIDLOOP_TEST_DATABASE_URL=postgresql://USER@localhost/postgres node --conditions=react-server --import tsx --test tests/fixed-routes.test.ts tests/pickup-settings.test.ts tests/pickup-calendar.test.ts tests/roles.test.ts
```

学生照片支持上传：配置私有 Vercel Blob 的 `BLOB_READ_WRITE_TOKEN`，运行迁移 `007_student_photos.sql`。照片经压缩和服务端重编码后存储，读取需要登录并具备对应学生权限。

## Operating terms

See [operating-term requirements](docs/operating-terms.md). Migration `011_operating_terms.sql` adopts existing school dates and plans without archiving the current term. `/terms` manages initialization, student review and whole-term archives.

```sh
KIDLOOP_TEST_DATABASE_URL=postgresql://USER@localhost/postgres node --conditions=react-server --import tsx --test tests/operating-terms.test.ts
```
