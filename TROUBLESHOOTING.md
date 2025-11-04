# Auto-Rotation Troubleshooting Guide

## Step 1: Check Railway Deployment

1. Go to Railway Dashboard → Your Project
2. Click on the deployment
3. Check **Logs** tab
4. Look for these messages:

```
✅ Database initialized successfully
🚀 SPIN Server running on port 5000
```

If not seeing these, deployment failed. Click "Redeploy" button.

## Step 2: Check Auto-Advance Logs

When you click "Refresh Rotations" in the intern dashboard, you should see:

```
[schedule] Fetching schedule for intern 4
[autoAdvance] Starting auto-advance for intern 4
[autoAdvance] Today is: 2025-11-04 (UTC)
[autoAdvance] Intern 4 has 120 rotations in history
[autoAdvance] Intern 4: last rotation end_date=2025-11-02, today=2025-11-04
[autoAdvance] Intern 4: FORCING rotation creation - last rotation completed...
[autoAdvance] ✅ Created UPCOMING rotation for intern 4:
   - Unit: Adult Neurology
   - Start: 2025-11-05 (> today: true)
   - End: 2025-11-05
```

If you DON'T see these logs, the endpoint isn't being called.

## Step 3: Common Issues

### Issue A: No Logs Appearing
**Cause:** Request not reaching server (CORS, API URL, etc.)
**Fix:**
1. Check browser console for errors (F12 → Console)
2. Check Network tab (F12 → Network)
3. Look for `/api/interns/{id}/schedule` request
4. Check if it's getting 404 or 500 errors

### Issue B: Logs Show "No upcoming rotation needed"
**Cause:** Logic thinks rotations already exist
**Fix:**
```sql
-- In Railway Database, run:
SELECT * FROM rotations WHERE intern_id = 4 ORDER BY start_date DESC LIMIT 5;
```
Check if there are future rotations already. If yes, delete them:
```sql
DELETE FROM rotations WHERE intern_id = 4 AND is_manual_assignment = 0 AND start_date > date('now');
```

### Issue C: Logs Show "All units completed"
**Cause:** Intern already went through all units
**Fix:** This is expected behavior. Auto-rotation only goes through each unit once.
Check:
```sql
SELECT COUNT(DISTINCT unit_id) as completed_units FROM rotations WHERE intern_id = 4;
SELECT COUNT(*) as total_units FROM units;
```
If completed_units = total_units, that's why.

### Issue D: Rotations Created But Not Showing
**Cause:** Client timezone issue (should be fixed now)
**Fix:**
1. Hard refresh browser (Ctrl+Shift+R or Cmd+Shift+R)
2. Clear browser cache
3. Check browser console for `[InternDashboard] Upcoming: 0` message
4. If still 0, check the rotation dates in database match format 'YYYY-MM-DD'

## Step 4: Manual Fix (Nuclear Option)

If nothing works, clear all automatic rotations and let them regenerate:

```sql
-- 1. Delete all automatic rotations
DELETE FROM rotations WHERE is_manual_assignment = 0 OR is_manual_assignment = false;

-- 2. Then click "Refresh Rotations" in intern dashboard
```

## Step 5: Check Database State

In Railway Database:

```sql
-- Check today's date from server perspective
SELECT date('now');

-- Check last rotation for intern
SELECT * FROM rotations WHERE intern_id = 4 ORDER BY start_date DESC LIMIT 1;

-- Check upcoming rotations
SELECT * FROM rotations WHERE intern_id = 4 AND start_date > date('now');

-- Check all units
SELECT id, name, duration_days FROM units;
```

## Step 6: Test Locally First

If production still not working, test localhost:
1. Open http://localhost:3000
2. Open intern dashboard
3. Click "Refresh Rotations"
4. Check terminal logs
5. Verify upcoming rotations appear

If it works locally but not in production, the issue is environment-specific (database state, timezone, etc.)

## Getting Help

If still not working, provide:
1. Railway logs (last 50 lines)
2. Browser console errors
3. Results from database queries above
4. Screenshot of intern dashboard showing "No upcoming rotations"

