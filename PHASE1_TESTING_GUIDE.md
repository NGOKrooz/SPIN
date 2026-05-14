# 🧪 SPIN 1.0 Phase 1 Testing Guide

## Quick Start - Verify Implementation

### 1. Check Server Logs
When the system runs, look for startup message:
```
🔄 Auto-Rotation: Disabled
```

### 2. Test Auto-Advance Endpoints (Should Fail)
```bash
# These should return 501 Not Implemented:
POST http://localhost:3001/api/rotations/auto-advance
POST http://localhost:3001/api/interns/{id}/auto-advance
```

Expected response:
```json
{
  "error": "Auto-advance is disabled in Phase 1. Use confirmation-based movement system instead.",
  "phase": "PHASE 1: Confirmation-Based Movement"
}
```

### 3. Monitor Console for Awaiting Confirmation
Every time interns are fetched, console should show:
```
[PHASE 1] Awaiting Confirmation: [intern name] - Next unit: [unit]
```

### 4. Check Dashboard
- Navigate to Dashboard
- Look for "Awaiting Confirmation for all the Upcoming Movements" section
- Verify interns appear in this section (not "Upcoming Movements")
- Verify day counter shows exceeding duration (21/21, 22/21, etc)

---

## Manual Testing Scenario

### Setup
1. Create an intern with 20-day duration starting today
2. Assign to "Adult Neurology" unit
3. Create a next rotation (manual or via batch assignment)

### Test Day 20
- ✅ Intern should be active
- ✅ Duration shown: 20/20
- ✅ Next rotation should be "upcoming" status

### Test Day 21 (Trigger Awaiting Confirmation)
- Change system date forward 1 day
- Refresh dashboard
- Look in browser console for: `[PHASE 1] Awaiting Confirmation: [intern name]`
- Database should show next rotation status: `"awaiting_confirmation"`

### Verify in Dashboard
- ✅ Card appears in "Awaiting Confirmation" section
- ✅ Shows "1 days exceeded" badge
- ✅ Duration displays: 21/20
- ✅ Accept/Reassign buttons visible but disabled

### Test Day 25
- Change system date to 5 days later
- Refresh dashboard
- ✅ Duration shows: 25/20
- ✅ Shows "5 days exceeded" badge
- ✅ Card still in awaiting_confirmation section

---

## Database Verification

### Check Rotation Statuses
```javascript
// In mongo shell or db client:
db.rotations.find({status: "awaiting_confirmation"})

// Should show:
{
  _id: ObjectId(...),
  intern: ObjectId(...),
  unit: ObjectId(...),
  status: "awaiting_confirmation",  // ← This changed from "upcoming"
  startDate: ISODate(...),
  endDate: ISODate(...),
  duration: 20,
  ...
}
```

### Check No Active Rotations Were Completed
```javascript
// The current rotation should still be active:
db.rotations.findOne({status: "active", intern: ObjectId(...)})

// Should NOT be "completed" yet
```

---

## Expected Behavior Flow

```
Day 1-20:
├─ Current rotation: ACTIVE
├─ Next rotation: UPCOMING
└─ Dashboard: Empty awaiting_confirmation

Day 21+ (after duration):
├─ Current rotation: ACTIVE (still!)
├─ Next rotation: AWAITING_CONFIRMATION (auto-converted)
├─ Day counter: 21/20, 22/20, etc
└─ Dashboard: Shows awaiting_confirmation card
  └─ Days exceeded: 1, 2, 3, etc
```

---

## Debug Code Snippets

### Add to Dashboard Component
```javascript
useEffect(() => {
  console.log('Awaiting Confirmations:', awaitingConfirmations);
  console.log('Interns rotation data:', interns);
}, [awaitingConfirmations, interns]);
```

### Check Rotation Status in Console
```javascript
// In browser console:
api.getInterns().then(interns => {
  interns.forEach(intern => {
    const awaitingConf = intern.rotations?.find(r => r.status === 'awaiting_confirmation');
    if (awaitingConf) {
      console.log(`${intern.name}: awaiting confirmation for ${awaitingConf.unitName}`);
    }
  });
});
```

---

## Troubleshooting

### Issue: No "Awaiting Confirmation" Cards Appear
**Cause:** No rotations have status "awaiting_confirmation"

**Check:**
1. Verify rotation duration has actually expired (today >= endDate)
2. Check database: `db.rotations.find({status: "awaiting_confirmation"}).count()`
3. Verify checkAndMarkAwaitingConfirmation is being called
4. Look for errors in server console

### Issue: Day Counter Frozen at Duration
**Cause:** calculateElapsedDays is still using Math.min()

**Check:**
```javascript
// Should allow overflow:
// NOT: Math.min(duration, elapsedDays)
// YES: elapsedDays
```

### Issue: Auto-Advance Still Working
**Cause:** Old version of autoAdvanceRotation still running

**Check:**
```javascript
// autoAdvanceRotation should log:
[PHASE 1] autoAdvanceRotation is disabled. Interns no longer auto-advance.
```

### Issue: Upcoming Movements Still Showing
**Cause:** Dashboard still using old buildUpcomingMovements

**Check:**
1. Verify Dashboard.js imports buildAwaitingConfirmations (not buildUpcomingMovements)
2. Verify Card title shows "Awaiting Confirmation"
3. Verify upcomingMovements variable removed

---

## Next Steps (Phase 2)

- [ ] Implement Accept button functionality
- [ ] Implement Reassign button functionality
- [ ] Add reassignment modal
- [ ] Add movement confirmation logging
- [ ] Add activity history tracking
- [ ] Test accept/reassign workflows

---

## Key Files to Monitor

1. **Server Console:** Look for [PHASE 1] messages
2. **Browser Console:** Check for errors in predictivePlanning.js
3. **Database:** Verify rotation statuses changing
4. **Network Tab:** Check /api/interns response includes rotations

---

## Success Criteria

- [ ] No auto-advance occurring
- [ ] Day counter exceeds planned duration
- [ ] "Awaiting Confirmation" cards appear on dashboard
- [ ] Rotation status changes to "awaiting_confirmation"
- [ ] Accept/Reassign buttons visible (disabled)
- [ ] Console shows debug logs
