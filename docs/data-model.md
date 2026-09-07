# KidLoop Data Model

> Status: MVP implementation baseline
>
> Updated: 2026-09-07

## Core records

| Table | Purpose |
| --- | --- |
| `schools` | School identity, address, map and pickup instructions; grade pickup times are in school rules. `calendar_archived_through` and `calendar_archived_at` hide retained historical calendar dates per school. |
| `after_school_programs` | Program name and driver-facing dropoff address, information, and requirements. |
| `classrooms` | Simple class grouping within a school. |
| `parents` | Primary parent contact associated with a student. |
| `students` | Student identity, photo URL, class, grade, age, destination, and pickup notes. |
| `vehicles` | Vehicle name, plate, seat capacity, and operational status. |
| `drivers` | Driver identity, phone, and availability status. |
| `school_terms` | School term date ranges. |
| `school_calendar_exceptions` | School closures and special pickup times. |
| `school_pickup_rules` | Multiple grades sharing weekdays and a pickup time. |
| `fixed_routes` | Independent recurring route, dates, weekdays, regular driver/vehicle and enabled state. |
| `fixed_route_stops` | Ordered school, program or custom locations with planned arrival times. |
| `fixed_route_students` | Student pickup and later dropoff stops on a fixed route. |
| `route_task_issues` | Per-route, per-date generation conflicts shown to administrators. |
| `student_photos` | Private upload metadata, uploader and optional student association. |
| `driver_shifts` | Dated assignment of one driver to one vehicle for a time window. |
| `trips` | A dated execution snapshot of a fixed multi-stop route; legacy school-to-program trips are retained. |
| `trip_students` | Students assigned to a trip and each student's current ride status. |
| `status_history` | Append-only history of each student ride status transition. |
| `kidloop_migrations` | Applied SQL migration records. |

## Main relationships

```text
schools ──< school_terms / school_calendar_exceptions / school_pickup_rules
schools ──< classrooms ──< students >── parents
fixed_routes >── drivers / vehicles
      |──< fixed_route_stops >── schools / after_school_programs (or custom location)
      |──< fixed_route_students >── students + pickup/dropoff stops
      +──< trips >── driver_shifts >── drivers / vehicles
              +──< trip_students >── students
                         +──< status_history
```

## Enforced rules and execution snapshots

- School pickup rules contain a `grades` array, not a classroom selection. Legacy `school_pickup_rule_classes` and `pickup_routes` remain for compatibility.
- Stops must be ordered with increasing times. Student pickup must match the student's school; dropoff must be a later stop.
- Enabled routes require school terms/rules, a driver, vehicle and riders. Capacity is checked per segment, not against total riders throughout a multi-stop trip.
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
