## SPIN — Apply These File Replacements Exactly. No Analysis, No Redesign.

Do not investigate, do not re-derive root causes, do not propose alternative approaches, do not
refactor anything beyond what's listed. Every file below is a complete, tested, ready-to-use
replacement. Your only job is: open each file at the path given, replace its entire contents with
the attached version, save, move to the next one. All of them are independent of each other —
apply them in any order, there are no conflicts between them.

CORS/login is already fixed — do not touch `config/cors.js`.

---

## Replace these files in full

1. `services/dynamicAssignmentService.js` → replace entirely with attached `dynamicAssignmentService.js`
2. `services/rotationService.js` → replace entirely with attached `rotationService.js`
3. `services/internService.js` → replace entirely with attached `internService.js`
4. `routes/interns.js` → replace entirely with attached `interns.js`
5. `components/MovementQueueBoard.js` → replace entirely with attached `MovementQueueBoard.js`
6. `components/MovementControls.js` → replace entirely with attached `MovementControls.js`
7. `components/InternDashboard.js` → replace entirely with attached `InternDashboard.js`
8. `pages/Interns.js` → replace entirely with attached `Interns.js`
9. `pages/Rotations.js` → replace entirely with attached `Rotations.js`

(Numbering above is just a checklist, not priority order — none of these depend on being applied
in sequence.)

---

## One manual edit — no file attached for this one

Open `lib/utils.js`, find `getStatusColor`, add a case for `'pending'` / `'Pending'` returning a
yellow style (e.g. `bg-yellow-100 text-yellow-800`), matching whatever pattern the existing
`active` / `completed` cases already use. Do not change any other case. If an `'extended'` case
exists, leave it — harmless, just unused now.

---

## What these files do, one line each (context only — do not act on this section, just apply the files above)

- Interns now go `Pending` the moment they're overdue, with a real staged next-unit rotation
  created automatically (was previously never created, so Accept/Reassign always failed).
- The "22/21 days" overdue counter now actually increments (was computed but never saved).
- Dashboard Movement Queue now finds overdue interns (was reading a field name that doesn't
  exist on the API response).
- Accept/Reassign buttons are visible-but-disabled within 5 days of due, and only clickable once
  actually overdue (was clickable too early).
- Day-counter no longer goes blank on the final day of an extended rotation; the "Next
  Assignment" card no longer flashes a false error (both were reading stale/wrong fields).
- Accept/Reassign buttons now also appear on the intern's own dashboard, not just the main
  Dashboard queue (they never existed there before).
- Status can no longer flash to "Completed" mid-rotation (was a write-ordering race).
- Status is now only ever `Active`, `Pending`, or `Completed` — `Extended` is fully removed as a
  status everywhere; extension days still show as a plain number/badge on top of whichever status
  applies.

---

## After applying all files + the `lib/utils.js` edit

Restart the app and confirm, quickly, without further code changes:
- An intern within 5 days of due shows disabled Accept/Reassign, in both the Dashboard queue and
  their own dashboard.
- Once overdue, status shows `Pending` (yellow) immediately, buttons become clickable, day
  counter keeps climbing (22/21, 23/21, ...).
- Accept moves them and status returns to `Active` — reload a few times fast, it should never
  say `Completed`.
- Reassign only offers eligible units and keeps status `Pending` until Accept is clicked.
- No screen anywhere shows a status other than Active / Pending / Completed.

If any of these don't hold after applying the files exactly as given, stop and report which
checklist item failed and what you actually saw — do not attempt your own fix on top of these
files.

Commit and push only after the checklist above passes.
