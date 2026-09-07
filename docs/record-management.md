# Editing and Removing Records

Administrators can edit or remove students, vehicles and drivers using the pencil and trash controls on each record. Forms support Chinese and English, pending/error feedback, keyboard dismissal and confirmation before removal. Concurrent edits are checked against the record's update timestamp.

- Student edits cover name, school/class, program, grade, optional age, photo replacement/removal, parent contacts and pickup notes. Existing embedded photos and import provenance are preserved. Editing a shared parent contact affects only the selected student. School or destination changes require all existing open trips to be completed or canceled first.
- Student removal archives the record using `active=false`. It disappears from the roster and new-trip selection, while existing trips and history remain. It does not cancel existing trips.
- Vehicle edits cover name, plate, capacity and availability. Capacity cannot fall below the rider count on an open trip. Driver edits cover name, phone and availability.
- Vehicle/driver removal archives the record. Open trips or active/current/future scheduled shifts must be resolved before removal or changing to maintenance/off-duty. A removed driver's login account is disabled. Completed history remains accessible.
- Scheduling checks active resource records under database locks; archived resources cannot be assigned new work.

Apply migration `004_fleet_archive.sql` through the existing migration runner. The database integration checks create isolated fixtures in one rolled-back transaction:

```sh
node --experimental-strip-types --env-file=.env.local scripts/test-record-management.mjs
```
