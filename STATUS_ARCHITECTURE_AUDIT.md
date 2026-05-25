# STATUS_ARCHITECTURE_AUDIT

## Executive Summary

This audit reviews SPIN 1.0 status handling for the four-state rotation lifecycle:
- `active`
- `awaiting_confirmation`
- `upcoming`
- `completed`

The codebase has partial support for the 4-state model, but several core normalization and cleanup paths still treat `awaiting_confirmation` as a derived or transient state. That risks hiding the state from the UI, overwriting it during sync/refresh, and deleting valid rotation data.

## 4-State Model Definition

- `active`: the current live rotation assignment.
- `awaiting_confirmation`: the next assignment has been staged, but the intern has not yet accepted the move.
- `upcoming`: a future assignment with no pending confirmation workflow.
- `completed`: a finished rotation.

## Critical Findings

### 1. View status derivation ignores `awaiting_confirmation`
- File: `server/services/internViewService.js`
- Location: `getRotationStatus()` near line 42
- Problem: `awaiting_confirmation` is not preserved by the rotation status derivation logic.
- Impact: rotations in `awaiting_confirmation` can be reclassified as `active`, `upcoming`, or `completed` based solely on dates, causing UI inconsistency and broken client-side visibility.

### 2. Intern sync function overwrites durable `awaiting_confirmation`
- File: `server/routes/interns.js`
- Location: `syncInternRotationStates()` at line 308
- Problem: status normalization rewrites all rotations from date logic, without preserving `awaiting_confirmation`.
- Impact: an intern who has an overdue active rotation and a staged next rotation can lose the pending confirmation state during backend sync.

### 3. Activity feed status sync also loses `awaiting_confirmation`
- File: `server/routes/activity.js`
- Location: `syncRotationMovementsForFeed()` at line 40
- Problem: the feed refresh routine recalculates rotation statuses and will convert `awaiting_confirmation` into one of the other lifecycle states.
- Impact: activity dashboard and recent activity may misreport intern movement state and drop pending confirmations.

### 4. Dangerous unconditional upcoming-rotation cleanup
- File: `server/routes/interns.js`
- Location: `router.post('/:id/reassign')` at line 843
- Problem: `Rotation.deleteMany({ intern: intern._id, status: 'upcoming' })` is executed unconditionally.
- Impact: valid future rotation assignments can be deleted accidentally. The code comment says this is legacy cleanup, but the query is too broad.

### 5. Dangerous unconditional upcoming-rotation cleanup in dynamic assignment
- File: `server/services/dynamicAssignmentService.js`
- Location: `assignNextUnit()` at line 561
- Problem: `Rotation.deleteMany({ intern: intern._id, status: 'upcoming' })` is executed before rebuilding assignments.
- Impact: legitimate upcoming rotations may be destroyed during assignment recalculation.

## Secondary Findings

### Good coverage
- `server/models/Rotation.js` defines `status` enum with all four lifecycle values.
- `server/services/assignmentUtils.js` includes `awaiting_confirmation` in the valid lifecycle status set.
- `server/services/rotationPlanService.js` already includes `awaiting_confirmation` in key queries and rebuild logic.

### Remaining risk areas
- Any other normalization or view function that derives status from dates rather than checking explicit lifecycle state requires review.
- The current UI grouping in `server/services/internViewService.js` uses `upcomingUnits` for only `upcoming`; if the client needs to surface `awaiting_confirmation` in the same queue, that should be reviewed separately.

## Recommended Minimal Fixes

1. Preserve explicit `awaiting_confirmation` in all status normalization code paths.
   - `server/services/internViewService.js`
   - `server/routes/interns.js`
   - `server/routes/activity.js`

2. Remove or scope generic cleanup queries that delete `status: 'upcoming'` without a legacy-only guard.
   - `server/routes/interns.js` `/reassign`
   - `server/services/dynamicAssignmentService.js`

3. Add targeted regression coverage for `awaiting_confirmation`:
   - `GET /api/interns/:id` should preserve `awaiting_confirmation` in the rotation list.
   - `syncInternRotationStates()` should not overwrite pending confirmation records.
   - `syncRotationMovementsForFeed()` should keep `awaiting_confirmation` intact.
   - `reassign` / assignment rebuild paths should not delete valid upcoming follow-up rotations.

4. Audit any additional status filters and `$in` clauses for missing `awaiting_confirmation`.

## Suggested Follow-Up

- Perform a focused search for all `status` filters in `server/**/*.js` and confirm the 4-state lifecycle is handled consistently.
- Convert legacy cleanup delete operations into explicit legacy-only queries or remove them once migration is complete.
- Consider adding a distinct `awaitingConfirmation` view field if the frontend needs a clear separation from generic upcoming assignments.

---

## Current Patch Notes

The following source updates were applied as part of this audit:
- Preserved `awaiting_confirmation` in `server/services/internViewService.js` status derivation.
- Preserved `awaiting_confirmation` in `server/routes/interns.js` sync normalization.
- Preserved `awaiting_confirmation` in `server/routes/activity.js` feed sync logic.
