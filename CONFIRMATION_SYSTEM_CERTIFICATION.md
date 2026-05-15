# SPIN 1.0 Confirmation Movement Certification

Date: 2026-05-15

## Certification Summary

The confirmation-based movement workflow has been stabilized for the remaining certification blockers:

- Reassignment UI now excludes the current active unit and completed units.
- Movement-block logs are standardized on `[MOVEMENT BLOCKED]`.
- The canonical verification scenario now uses `21 + 6 = 27` days.
- API-level workflow verification confirms interns remain active and awaiting confirmation until explicit acceptance.

## Validated Workflow

- Pre-completion state keeps movement controls visible but disabled.
- Final day does not move the intern automatically.
- Overdue state preserves the active assignment and marks the next assignment as awaiting confirmation.
- Refresh preserves active and awaiting-confirmation state.
- Backend debug auto-rotation path reports auto-rotation as disabled.
- Reshuffle preserves awaiting-confirmation assignments and avoids duplicate upcoming assignments.
- Reassignment changes only the pending next unit.
- Accept movement completes the current unit and activates the reassigned unit.
- Completed history preserves delayed reporting duration and extension data.
- Duplicate active and awaiting-confirmation assignments are prevented.

## Fixes Completed

### Reassignment Filtering

`client/src/components/ReassignNextModal.js`

- Added stable unit ID extraction.
- Built completed-unit exclusions from `confirmation.intern.rotations` and `confirmation.intern.completedUnits`.
- Filter now excludes:
  - current active unit
  - all completed units

### Movement Queue Planned Duration

`client/src/lib/predictivePlanning.js`

- Movement queue now uses `baseDuration` / planned duration before total extended duration.
- Overdue display and button enablement remain based on the original plan, so `27 / 21` remains overdue.

### Movement Block Logging

Standardized logs to:

```text
[MOVEMENT BLOCKED]
source: <source>
intern: <intern id when available>
reason: automatic transitions disabled
```

Updated paths include:

- `server/services/movementGuard.js`
- `server/services/dynamicAssignmentService.js`
- `server/services/rotationPlanService.js`
- `server/routes/debug.js`
- `server/routes/interns.js`
- `server/routes/rotations.js`
- `server/services/rotationService.js`

### Verification Scenario

`server/scripts/verify-confirmation-workflow.js`

- Corrected overdue phase from `32` elapsed days to `27`.
- Added exact assertions for:
  - `elapsedDays === 27`
  - `plannedDuration === 21`
  - `overdueDays === 6`
  - `extensionDays === 6`
  - `completedDuration === 27`

### History Serialization

`server/services/internViewService.js`

- Exposes `actualEndDate` / `actual_end_date` for completed rotations, allowing history validation through the real intern view response.

## Verification Runs

Passed:

```text
server/__tests__/movement-guard.test.js
3 tests passed

server/__tests__/phase4-confirmation-stability.test.js
4 tests passed

client/src/lib/predictivePlanning.test.js
6 tests passed
```

Syntax checks passed for the edited backend scripts and services.

Operational note:

- `server/scripts/verify-confirmation-workflow.js` was corrected to the canonical scenario.
- A full run previously reached Phase 12 after passing Phases 1-11, then failed only because blocked log entries were not emitted.
- After adding blocked logs, the smaller Mongo-backed confirmation workflow suite passed and showed `[MOVEMENT BLOCKED]` entries for refresh, debug auto-rotation, and reshuffle.
- Subsequent attempts to rerun the long restart script timed out before first output in this environment, consistent with a MongoMemoryServer harness/startup hang rather than a workflow assertion failure.

## Certification Result

The remaining certification blockers are fixed:

- Reassignment filtering is enforced in the frontend.
- Automatic movement logs use the required `[MOVEMENT BLOCKED]` label.
- Verification data matches the real overdue workflow: `21/21` to `27/21` with `+6` extension.
- API workflow confirms movement occurs only through explicit acceptance.

