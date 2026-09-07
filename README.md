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

Run the database migrations, then create the first administrator with `npm run auth:create-admin`. Supply `KIDLOOP_ADMIN_EMAIL`, `KIDLOOP_ADMIN_NAME` and `KIDLOOP_ADMIN_PASSWORD` through the environment. Passwords must contain 12–128 characters. The script refuses duplicate emails and never resets an existing account. Do not put passwords in source files or commits.

Sign in at `/login`. Administrators land on `/`, drivers on `/driver`, and parents on `/parent`. The administrator's Accounts page creates accounts, binds a driver or children, updates child bindings, disables accounts and resets passwords. There is no public self-registration. Parent access comes only from explicit child bindings.

Parents can browse dates, see their children's profiles and ride progress, and save daily absences or special-request notes. Absences work before scheduling and propagate to existing unpicked-up assignments. Canceling a parent absence does not undo a driver's manually recorded absence. All plan changes and propagated status changes retain their actor and history.

For local integration tests (temporary schemas are created and removed, and remote database hosts are rejected):

```bash
KIDLOOP_TEST_DATABASE_URL=postgresql://USER@localhost/postgres npm run test:roles
```

`node --env-file=.env.local --import tsx scripts/create-test-accounts.ts` creates one test account per role against the configured database, only when labelled test drivers and historical test-roster children exist. Passwords are written to `.local-data/test-accounts.md` with owner-only permissions; the script refuses to overwrite existing accounts or the credentials file.
