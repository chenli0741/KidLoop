# Editing and Removing Records

## School Calendar Archive

Administrators can archive an ended term from Schools > School > School terms. Confirmation covers all calendar dates for that school through the selected term's end date, inclusive, not just dates inside that term. Current and future terms cannot be archived.

Migration `010_school_calendar_archive.sql` stores `schools.calendar_archived_through` and `calendar_archived_at`. Historical terms and exceptions remain in the database but disappear from normal school settings and the calendar. Previous-month navigation stops at the archive boundary; archived days cannot be opened. Archived date records cannot be edited, deleted or recreated through settings actions. An exception spanning the boundary is split transactionally, preserving a historical segment and an editable future segment. No restore interface is provided.

School identity, weekly pickup rules, students, destinations, routes, drivers and vehicles carry forward unchanged. Actual dated trips and status history remain available as operational records; calendar archiving does not delete or cancel them. New terms and date-specific holidays must be configured separately. Tests use isolated fixtures; no existing user school term was archived during verification.

Administrators can edit or remove students, vehicles and drivers using the pencil and trash controls on each record. Forms support Chinese and English, pending/error feedback, keyboard dismissal and confirmation before removal. Concurrent edits are checked against the record's update timestamp.

Student cards place the edit and remove controls in the upper-right corner beside the name, not in a separate bottom row. Names wrap without overlapping the controls. The compact layout was verified at 320, 390 and 1280 pixel widths; the edit/remove dialogs and confirmation behavior are unchanged. Fleet controls keep their existing layout.

- Student edits cover name, school/class, program, grade, optional age, photo replacement/removal, parent contacts and pickup notes. Existing embedded photos and import provenance are preserved. Editing a shared parent contact affects only the selected student. School or destination changes require all existing open trips to be completed or canceled first.
- Student removal archives the record using `active=false`. It disappears from the roster and new-trip selection, while existing trips and history remain. It does not cancel existing trips.
- Vehicle edits cover name, plate, capacity and availability. Capacity cannot fall below the rider count on an open trip. Driver edits cover name, phone and availability.
- Vehicle/driver removal archives the record. Open trips or active/current/future scheduled shifts must be resolved before removal or changing to maintenance/off-duty. A removed driver's login account is disabled. Completed history remains accessible.
- Scheduling checks active resource records under database locks; archived resources cannot be assigned new work.

Apply migration `004_fleet_archive.sql` through the existing migration runner. The database integration checks create isolated fixtures in one rolled-back transaction:

```sh
node --experimental-strip-types --env-file=.env.local scripts/test-record-management.mjs
```
