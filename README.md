# KidLoop

KidLoop is a web-first operations system for after-school pickup and dropoff management.

## Implemented MVP

- Multiple vehicles with license plate, capacity, and availability state.
- Drivers and dated driver/vehicle shifts.
- School pickup details and after-school dropoff details.
- Student roster with photo, class, grade, age, destination, and parent contact.
- Trip planning with vehicle capacity, driver/vehicle overlap, and duplicate student checks.
- Driver pickup manifest with per-student pickup, dropoff, absent, and issue states.
- Automatic trip status updates and status history.
- Responsive desktop and mobile interfaces.

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

Then open [http://localhost:3000](http://localhost:3000).

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
