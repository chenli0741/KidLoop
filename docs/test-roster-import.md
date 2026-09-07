# Historical Test Roster Import

The selected batches contain 19 students from three schools, with 11 supplied photos. Private manifests and extracted photo previews live in `.local-data/`, which is excluded from Git. Source images are supplied separately; no child photos or contact details are embedded in the import script.

The importer extracts the labelled photo rectangles without generating or altering faces. Small JPEGs are stored in `students.photo_url` as data URLs, so this test batch does not depend on temporary source files or a public asset upload after import.

Run migrations, preview, then apply a reviewed manifest:

```sh
npm run db:migrate
node --env-file=.env.local scripts/import-roster.mjs .local-data/ellis-test.json
node --env-file=.env.local scripts/import-roster.mjs .local-data/ellis-test.json --apply
node --env-file=.env.local scripts/import-roster.mjs .local-data/mcauliffe-test.json --apply
node --env-file=.env.local scripts/import-roster.mjs .local-data/stratford-test.json --apply
node --env-file=.env.local scripts/enrich-test-locations.mjs
```

Preview runs roll back their database transaction and write local photo previews. Apply runs are transactional and skip existing students with the same school and name, including inactive students. Ambiguous school/program names stop the import. Imports do not overwrite existing records or create trips or attendance.

Age and parent associations may be null for incomplete imported records; normal manual-entry validation remains unchanged. Missing school dismissal times are nullable. Roster and manifest queries retain students without parent records, and display missing information as pending. Historical schedules are source notes, not recurring pickup rules. Each imported student's notes include the batch and source filenames.

## Test Vehicles and Routes

The route seed adds two clearly labelled test vehicles and two test drivers, with 13:30-17:00 shifts on the supplied date (default: today in America/Los_Angeles). Driver phone numbers remain empty. Vehicle TEST-01 has 14 passenger seats and runs McAuliffe to One Stop at 14:35 (6 students), then Stratford School to Morningstar Saratoga at 15:30 (8 students). Vehicle TEST-02 has 8 passenger seats and runs Ellis to Little Tree at 14:30 (5 students).

These are simulated test departure times, not a verified operational pickup schedule or recurring routes. The seed preserves rider statuses on reruns, records initial status history, and checks roster membership, capacity, existing student assignments and driver/vehicle shift overlap. Stable IDs prevent duplicate vehicles, shifts, trips and history on repeated runs for the same date.

The independent `/routes` module reads `fixed_routes`, not these dated test trips. Existing test trips remain in history and are not automatically converted to recurring routes. Configure confirmed school terms and recurring routes before expecting future daily assignments; do not invent term dates to populate the calendar.

```sh
node --env-file=.env.local scripts/seed-test-routes.mjs 2026-09-07
node --env-file=.env.local scripts/seed-test-routes.mjs 2026-09-07 --apply
```

## Default School Rules and Closures

The later user-confirmed weekly defaults and US federal holiday closures are recorded in `PROJECT_OVERVIEW.md`. These editable test defaults take precedence over historical roster times for the school rules; they do not rewrite old trips or claim to be verified official dismissal times.

```sh
node --env-file=.env.local scripts/seed-school-calendar.mjs
node --env-file=.env.local scripts/seed-school-calendar.mjs --apply
```

This seeds only Ellis, McAuliffe and Stratford School: six weekly rules and 23 holiday entries per school for 2026-2027, including the observed 2028 New Year closure on 2027-12-31. It does not set school terms or infer winter/spring/summer breaks. Private roster data and photos are not embedded in this script.
