# KidLoop Data Model

> Status: MVP implementation baseline
>
> Updated: 2026-09-09

## Core records

| Table | Purpose |
| --- | --- |
| `schools` | Full name in `name`, optional `short_name` for everyday display (fallback to full name); school identity, address, map and pickup instructions; grade pickup times are in school rules. `calendar_archived_through` and `calendar_archived_at` hide retained historical calendar dates per school. |
| `after_school_programs` | Program name and driver-facing dropoff address, information, and requirements. |
| `classrooms` | Simple class grouping within a school. |
| `parents` | Primary parent contact associated with a student. |
| `students` | Student identity, photo URL, class, grade, age, destination, and pickup notes. |
| `vehicles` | Vehicle name, plate, seat capacity, and operational status. |
| `drivers` | Driver identity, phone, and availability status. |
| `school_terms` | School term date ranges. |
| `school_calendar_exceptions` | School closures and special pickup times. |
| `school_pickup_rules` | Multiple grades sharing weekdays and a pickup time. |
| `fixed_routes` | Route dates, weekdays, driver/vehicle, enabled state and excluded student IDs. |
| `fixed_route_stops` | Ordered school/program locations, arrival times and dismissal batch. |
| `school_pickup_batches` | School, dismissal time and weekday sharing policy, with batch exclusions. |
| `schedule_preview_cache` | Content-versioned daily summaries; no execution records. |
| `route_task_issues` | Per-route, per-date generation conflicts shown to administrators. |
| `student_photos` | Private upload metadata, uploader and optional student association. |
| `driver_shifts` | Dated assignment of one driver to one vehicle for a time window. |
| `trips` | A dated execution snapshot of a configured multi-stop route. |
| `trip_students` | Students assigned to a trip and each student's current ride status. |
| `trip_segment_completions` | Explicit per-trip pickup/dropoff segment completion, timestamp and actor; independent of which segment is being viewed. |
| `status_history` | Append-only history of each student ride status transition. |
| `kidloop_migrations` | Applied SQL migration records. |

## Main relationships

```text
schools ──< school_terms / school_calendar_exceptions / school_pickup_rules
schools ──< classrooms ──< students >── parents
fixed_routes >── drivers / vehicles
      |──< fixed_route_stops >── schools / after_school_programs
      |    automatic roster ← students + school dismissal rules + program relationship
      +──< trips >── driver_shifts >── drivers / vehicles
              +──< trip_students >── students
                         +──< status_history
```

## Enforced rules and execution snapshots

- School pickup rules contain a `grades` array, not a classroom selection. Legacy `school_pickup_rule_classes` and `pickup_routes` remain for compatibility.
- Stops must be ordered with increasing times. Student pickup must match the student's school; dropoff must be a later stop.
- Enabled routes require school terms/rules and driver/vehicle bindings. Students are derived; arrangement review checks omissions, conflicts and per-segment capacity.
- Recurring route conflicts check overlapping dates, weekdays, time windows and shared resources/students. Daily generation also checks actual dated assignments.
- `(fixed_route_id, scheduled_date)` is unique. Saving routes and reading current/future dates synchronize tasks under a transaction-level advisory lock; no daily manual shift creation is required.
- Trips store `route_name` and JSON `route_stops` snapshots; assignments store pickup/dropoff stop IDs. Legacy `school_id` and `program_id` on trips are nullable for multi-stop routes.
- Holidays and school term boundaries decide rider eligibility. Parent day plans are respected. Existing active assignments are not duplicated.
- Started execution records retain their driver, stops and status. Unstarted dated tasks can follow changes to the fixed route.
- Route names are generated from stop labels, with numeric suffixes for collisions. Names are display labels; route UUIDs remain the identity.

## Current status transitions

```text
SCHEDULED ──> PICKED_UP ──> DROPPED_OFF
     |              |
     +──> ABSENT    +──> ABSENT or EXCEPTION
     |
     +──> EXCEPTION ──> PICKED_UP or ABSENT
```

When all students are `DROPPED_OFF` or `ABSENT`, the trip becomes `COMPLETED`. Any student in `EXCEPTION` moves the trip to `NEEDS_ATTENTION`.

## Planned additions

Organization membership, teachers, push notification devices, offline queues and per-date substitute-driver records remain outside the current implementation. Authentication, recurring routes and private photo metadata are already implemented.

## Implemented login and parent-plan tables

Migration `003_accounts_and_parent_requests.sql` adds `app_users` (ADMIN/DRIVER/PARENT), `user_students` (explicit parent-child links), `user_sessions` (hashed session tokens), `login_limits`, `student_day_plans` and append-only `student_day_plan_history`. `status_history.actor_id` records the authenticated operator; `trip_students.parent_absence` distinguishes parent absences from driver-recorded absences. One daily plan exists per child/date and can exist without a trip. Students, trips and assignments are locked in that order when applying a parent absence or updating a ride status, preventing a concurrent pickup from being overwritten.

See [confirmed requirements](confirmed-requirements.md) for product boundaries and [project overview](../PROJECT_OVERVIEW.md) for migration and verification commands.

## Automatic rosters and batch sharing

School and program foreign keys already exist on students. The route resolves students and stop mappings through `automatic-roster.ts`; there is no editable per-child stop assignment table. Exclusions retain separately arranged children without deleting them. `school_pickup_batches` owns the sharing policy for a school/dismissal-time/weekday, common to every participating route.

`schedule-trial.ts` derives daily plans and checks requirements, resources and per-segment capacity. The same result drives execution and calendar summaries. `schedule_preview_cache` hashes date-relevant inputs and stores small summaries; details are calculated only for a selected date. Viewing future calendars never requires creating trips.

Migrations 030/031 replace the manual route roster and route-pair tables. The user authorized a one-time clear/rebuild of all old execution data; school calendars, students, program relationships and resource identities remain inputs. Subsequent normal operations retain started trips and enforce completed-state locks.
