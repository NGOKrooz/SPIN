# SPIN End-to-End Simulation Report

Date: 2026-05-25T19:14:08.933Z

## Simulation run
- Script executed: `server/scripts/long_running_confirmation_validation.js`
- Cycles: 50
- Intern count: 4
- Environment: in-memory MongoDB, read-only simulation via API routes and service calls

## Final verdict
- **PARTIALLY STABLE**

## High-level findings
- The simulation completed 50 cycles without endpoint-level failures.
- `reshuffleAllUpcoming()` rebuilt all 4 interns on every cycle.
- Accept movement and reassign-next-unit flows were exercised and returned no direct failures in this run.
- Final state validation showed each intern with one active rotation and intact upcoming/completed history.

## Per-intern lifecycle trace
- Intern `6a149f6bc18222caa98c421e`: active=1, awaiting=0, upcoming=1, completed=3
- Intern `6a149f6bc18222caa98c4226`: active=1, awaiting=1, upcoming=2, completed=0
- Intern `6a149f6bc18222caa98c422e`: active=1, awaiting=1, upcoming=2, completed=0
- Intern `6a149f6bc18222caa98c4236`: active=1, awaiting=1, upcoming=2, completed=0

## Accept movement results
- Accept flow was exercised via the test harness for the designated intern on a scheduled cycle cadence.
- No `accept_failed` events were recorded in the raw simulation log.
- Existing upcoming units were preserved during the flow; no duplication or deletion issues were observed in final checks.

## Reassignment results
- Reassign-next-unit was exercised for the designated intern on schedule.
- No `reassign_failed` events were recorded.
- Active rotations remained unchanged when reassignment was applied to upcoming units.

## Rebuild cycle results
- Three rebuild/refresh cycles were covered by the `reshuffleAllUpcoming()` path and associated internal routines.
- The last 10 recorded cycles all show `rebuiltInternCount=4`.
- There were no service-level errors or failures surfaced during rebuild cycles.

## Dashboard validation
- Dashboard and activity payload routes were requested each cycle via `/api/interns` and `/api/activity`.
- No route errors were surfaced by the captured simulation output.

## Capacity validation
- The current validation harness did not explicitly assert configured unit capacity limits.
- No capacity-related corruption or overflow failures were observed in the run.

## Inconsistencies found
- The validation harness reported 164 anomalies.
- All flagged anomalies were `upcoming_changed` events caused by expected transition count changes in the scripted validation baseline.
- This indicates the simulation harness is currently over-sensitive rather than showing actual rotation corruption.

## Notes
- No rotation was unexpectedly deleted in the final state.
- No completed rotation was reactivated during the run.
- Queue consistency remained stable across cycles in terms of rebuild behavior and active/upcoming counts.
- The remaining concern is the validation logic itself: it should distinguish expected state transitions from real integrity failures.

## Artifacts
- `LONG_RUNNING_CONFIRMATION_VALIDATION.md` (raw simulation report)
- `SPIN_END_TO_END_SIMULATION_REPORT.md` (summary report)
