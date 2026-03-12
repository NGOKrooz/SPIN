# SPIN v1.0 — Rotation Distribution Algorithm

## Overview

When a new intern is created, the system must assign a **starting unit** from the
ordered unit sequence. To ensure fair distribution, each intern starts at a
different unit (round-robin). This document describes the algorithm, the bug that
was fixed, and guidelines for reuse in SPIN v2.

---

## Unit Sequence

Units are ordered by their `position` column (`ORDER BY COALESCE(position, 2147483647), id ASC`).  
Each intern cycles through *all* units exactly once before their internship ends.

Example with 4 units — U1, U2, U3, U4:

| Intern | Starting unit | Full cycle            |
|--------|---------------|-----------------------|
| A      | U1            | U1 → U2 → U3 → U4    |
| B      | U2            | U2 → U3 → U4 → U1    |
| C      | U3            | U3 → U4 → U1 → U2    |
| D      | U4            | U4 → U1 → U2 → U3    |
| E      | U1            | U1 → U2 → U3 → U4    |
| F      | U2            | U2 → U3 → U4 → U1    |

### Selecting the starting unit

```
startOffset = globalCounter % totalUnits
globalCounter += 1   // persisted immediately
startingUnit = units[startOffset]
orderedCycle = units[startOffset..] + units[..startOffset]
```

- `globalCounter` is a monotonically increasing integer shared across **all** interns.
- The modulo operation (`% totalUnits`) wraps automatically — intern 5 with 4 units
  starts at offset `5 % 4 = 1` (unit 2), giving circular rotation.
- Each intern's full cycle visits every unit exactly once.

---

## The Bug (pre-fix)

`globalCounter` was stored only in an in-memory JavaScript variable:

```js
let roundRobinOffset = 0;   // resets on every server restart ← BUG
```

**Impact:** The counter reset to 0 on every server restart.  Interns added in a
new server session always started from offset 0 (Unit 1), regardless of how many
interns had already been created.  This produced:

- Duplicate starting units across interns.
- Multiple interns concurrently assigned to the same unit.
- Identical upcoming rotation schedules.

---

## The Fix

### What changed

**File:** `server/routes/rotations.js`

1. Imported `getState` / `setState` from `server/database/systemState.js`.
2. Added DB key constant: `ROTATION_COUNTER_KEY = 'rotation_global_counter'`.
3. `getRoundRobinCounter()` — reads the counter from `system_state` table on the
   first call of each server session, then caches the value in memory for the rest
   of the session.
4. `setRoundRobinCounter(value)` — writes to `system_state` (persistent) **and**
   updates the in-memory cache.
5. Added `deriveCounterFromExistingData()` — a one-time bootstrap that runs when
   the key is absent from the DB.  It counts `DISTINCT intern_id` from
   `rotations WHERE is_manual_assignment = FALSE` to reconstruct the correct
   counter value from historical data.

### Storage

Counter is stored in the `system_state` table (key = `rotation_global_counter`),
which uses PostgreSQL `ON CONFLICT (key) DO UPDATE` for atomic upsert.

### Session-level caching

```
First call in session  →  read from DB  →  cache in roundRobinOffset
Subsequent calls       →  return cached value (counterLoaded = true)
setRoundRobinCounter   →  update cache + write to DB
```

This avoids a DB round-trip for every intern within the same session while still
loading the authoritative value on startup.

---

## Bootstrap Logic

When upgrading from the old version (where counter was not persisted), or after a
DB reset, the counter key will not exist in `system_state`.  On the first call to
`getRoundRobinCounter()`, the system automatically bootstraps:

```
counter = COUNT(DISTINCT intern_id) FROM rotations WHERE is_manual_assignment = FALSE
```

This counts every intern who ever received an auto-generated rotation, which is
exactly the number of times the old counter was incremented.  The bootstrapped
value is immediately persisted so the bootstrap only runs once.

---

## Test Cases

### Test Case 1 — Sequential individual additions

Add interns one at a time (separate API requests, same session):

| Call | Counter before | `startOffset` (4 units) | Expected first unit |
|------|---------------|-------------------------|---------------------|
| 1    | 0             | 0                       | U1                  |
| 2    | 1             | 1                       | U2                  |
| 3    | 2             | 2                       | U3                  |
| 4    | 3             | 3                       | U4                  |

Counter ends at 4, persisted in DB.

### Test Case 2 — Batch addition (simultaneous)

`POST /api/rotations/generate` iterates all active interns starting from the
current counter, assigns offsets in order, then saves the final counter.  Each
intern in the batch gets a unique offset, so all 4 units are covered.

### Test Case 3 — Addition after server restart

Before restart: 4 interns added, counter = 4 (stored in DB).  
After restart: counter loaded from DB on first read = 4.  
Intern 5: `4 % 4 = 0` → U1. ✓ (continues the sequence correctly)

### Test Case 4 — Upcoming rotations

`autoAdvanceRotations` uses `getNextUnitForIntern`, which navigates **within** a
single intern's rotation history and is unaffected by the global counter change.
Upcoming rotation generation is unchanged.

---

## Invariants for SPIN v2

1. **One global counter** — all interns share a single monotonic counter, regardless
   of batch, start date, or when they were added.
2. **Counter = total auto-assigned interns** — the counter equals the number of
   interns who received an auto-generated rotation schedule.
3. **`startOffset = counter % totalUnits`** — simple modulo gives circular wrapping.
4. **Persist immediately** — the counter must be written to stable storage before
   the HTTP response is returned (or atomically with the rotation rows).
5. **Manual assignments are excluded** — interns created with `initial_unit_id`
   (manual rotation) do not increment the counter.
6. **Unit order is deterministic** — units must always be sorted the same way
   (`ORDER BY COALESCE(position, ...), id ASC`) so the index into the array is
   stable across restarts.

---

## Files Modified

| File | Change |
|------|--------|
| `server/routes/rotations.js` | Replaced in-memory counter with DB-backed persistent counter |

## Files Unchanged

All other files — `internService.js`, `interns.js`, `autoAdvanceRotations`,
`getNextUnitForIntern`, unit history, completed rotations, extension logic — were
**not modified**.  The fix is fully backward-compatible.
