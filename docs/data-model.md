# KidLoop Data Model

> Status: MVP implementation baseline
>
> Updated: 2026-09-06

## Core records

| Table | Purpose |
| --- | --- |
| `schools` | School name and driver-facing pickup address, map, instructions, and dismissal time. |
| `after_school_programs` | Program name and driver-facing dropoff address, information, and requirements. |
| `classrooms` | Simple class grouping within a school. |
| `parents` | Primary parent contact associated with a student. |
| `students` | Student identity, photo URL, class, grade, age, destination, and pickup notes. |
| `vehicles` | Vehicle name, plate, seat capacity, and operational status. |
| `drivers` | Driver identity, phone, and availability status. |
| `driver_shifts` | Dated assignment of one driver to one vehicle for a time window. |
| `trips` | One school-to-program route assigned to a driver shift. |
| `trip_students` | Students assigned to a trip and each student's current ride status. |
| `status_history` | Append-only history of each student ride status transition. |
| `kidloop_migrations` | Applied SQL migration records. |

## Main relationships

```text
schools ──< classrooms ──< students >── parents
                               |
after_school_programs ─────────+

drivers ──< driver_shifts >── vehicles
                    |
                    +──< trips >── schools
                           |
                           +────── after_school_programs
                           |
                           +──< trip_students >── students
                                      |
                                      +──< status_history
```

## Enforced rules

- Vehicle capacity must be greater than zero.
- Student age must be between 3 and 20.
- A shift start time must be earlier than its end time.
- Server actions reject overlapping shifts for the same driver or vehicle.
- A trip date must match its selected shift date.
- Trip departure time must be inside the selected shift.
- Assigned student count cannot exceed vehicle capacity.
- Every assigned student must match the trip school and after-school program.
- A student cannot be assigned to more than one active trip on the same date.
- Student ride status transitions are validated and recorded in `status_history`.

## Current status transitions

```text
SCHEDULED ──> PICKED_UP ──> DROPPED_OFF
     |              |
     +──> ABSENT    +──> EXCEPTION
     |
     +──> EXCEPTION ──> PICKED_UP or ABSENT
```

When all students are `DROPPED_OFF` or `ABSENT`, the trip becomes `COMPLETED`. Any student in `EXCEPTION` moves the trip to `NEEDS_ATTENTION`.

## Planned additions

The MVP schema does not yet include authentication, organization membership, teachers, recurring weekly schedules, object-storage upload metadata, push notification devices, or offline synchronization queues.
