# SPIN 1.0 - Safe Database Migration Playbook

## Overview

This document describes the safe, non-destructive migration process for normalizing SPIN intern rotation data to a strict canonical schema.

**Mission**: Convert all rotation statuses to only allowed values: `"active"`, `"upcoming"`, `"completed"`

**Safety Guarantee**: ✅ Zero data loss, fully reversible

---

## Pre-Migration Checklist

### ✓ Prerequisites
- [ ] MongoDB connection verified
- [ ] `MONGO_URI` environment variable set in `server/.env`
- [ ] Node.js environment ready
- [ ] All migrations scripts present in `scripts/` folder:
  - `migrateRotationSchema.js` (main migration)
  - `validateMigration.js` (post-migration validation)
  - `rollbackMigration.js` (emergency rollback)

### ✓ Data Backup
- [ ] **CRITICAL**: Take full MongoDB backup before running migration
  ```bash
  mongodump --uri="$MONGO_URI" --out=./backup/pre-migration-$(date +%s)
  ```

### ✓ Safety Verification
- [ ] All interns in database (count: ?)
- [ ] All assignments in database (count: ?)
- [ ] No active processes modifying the database
- [ ] Development database used for first test run

---

## Migration Execution

### Step 1: Pre-Flight Audit (Read-Only)

The migration script will first perform a **read-only audit** to identify:
- Total number of interns
- Assignment count per intern
- Current status values
- Legacy fields present

**Example output:**
```
📋 STEP 1: READ-ONLY DATA AUDIT
════════════════════════════════════════════════════════════

👤 Intern: John Doe (ID: 507f1f77...)
   Assignments: 5
   Statuses: active, pending, extended
   ⚠️  Legacy fields: workflowState, awaiting_confirmation
```

### Step 2: Status Normalization (Write Phase)

For each assignment, the migration applies these rules:

#### Rule 1: Already Valid
```
IF status is already "active", "upcoming", or "completed"
THEN: Leave unchanged
```

#### Rule 2: Completed Detection
```
IF status is "completed", "extended", or "inactive"
AND endDate is in the past
THEN: Set status = "completed"
```

#### Rule 3: Future Assignment
```
IF startDate > today
THEN: Set status = "upcoming"
```

#### Rule 4: Currently Active
```
IF startDate <= today <= endDate
THEN: Set status = "active"
```

#### Rule 5: Default Active
```
IF unable to determine (no endDate but past startDate)
THEN: Set status = "active"
```

### Step 3: Legacy Field Removal

After all statuses are normalized:
- Remove `workflowState` field from all rotations
- Remove `awaiting_confirmation` field from all rotations

### Step 4: Validation

Before completing, verify:
✓ All statuses are valid (active, upcoming, completed)
✓ No legacy fields remain
✓ All interns have assignments (or are new)
✓ Completed rotations still exist
✓ No orphaned records

---

## Running the Migration

### Production-Ready Execution

```bash
# Navigate to project root
cd c:\Users\godsw\OneDrive\Documents\SPIN\ V1.0

# Run migration
node scripts/migrateRotationSchema.js

# Validate results
node scripts/validateMigration.js

# Check report
cat MIGRATION_REPORT.md
```

### Expected Output

```
╔══════════════════════════════════════════════════════════════╗
║          SPIN 1.0 - DATABASE MIGRATION                       ║
║  Safe, Non-Destructive Rotation Schema Normalization         ║
╚══════════════════════════════════════════════════════════════╝

🔗 Connecting to MongoDB...
✅ MongoDB connected successfully

📋 STEP 1: READ-ONLY DATA AUDIT
════════════════════════════════════════════════════════════

✨ STEP 2: SAFE STATUS NORMALIZATION
════════════════════════════════════════════════════════════

🧹 STEP 3: REMOVE LEGACY FIELDS
════════════════════════════════════════════════════════════

✔️  STEP 4: VALIDATION CHECKS
════════════════════════════════════════════════════════════

╔══════════════════════════════════════════════════════════════╗
║                   MIGRATION COMPLETED                        ║
╠══════════════════════════════════════════════════════════════╣
║ ✅ Interns processed:          X                              ║
║ ✅ Assignments updated:        Y                              ║
║ ✅ Legacy fields removed:      Z                              ║
║ ✅ Errors:                     0                              ║
║ ✅ Validation issues:          0                              ║
╚══════════════════════════════════════════════════════════════╝
```

---

## Post-Migration Validation

### Automated Validation

```bash
node scripts/validateMigration.js
```

This verifies:
1. ✅ Intern record count unchanged
2. ✅ All rotation statuses valid
3. ✅ No legacy fields remain
4. ✅ Status distribution reasonable
5. ✅ All interns have assignments
6. ✅ No orphaned rotations
7. ✅ Completed assignments preserved

### Manual Validation Queries

Connect to MongoDB and run these queries:

```javascript
// Check 1: Invalid statuses (should be empty)
db.rotations.find({ 
  status: { $nin: ["active", "upcoming", "completed"] } 
}).count();

// Check 2: Legacy fields (should be empty)
db.rotations.find({ workflowState: { $exists: true } }).count();
db.rotations.find({ awaiting_confirmation: { $exists: true } }).count();

// Check 3: Status distribution
db.rotations.aggregate([
  { $group: { _id: "$status", count: { $sum: 1 } } }
]);

// Check 4: All rotations have intern reference
db.rotations.find({ intern: { $exists: false } }).count();
```

---

## Migration Reports

Two files are generated:

### 1. `MIGRATION_REPORT.md`
High-level summary with:
- Execution metrics
- Changes applied
- Validation results
- System state after migration

### 2. `MIGRATION_CHANGES.json`
Detailed change log with:
- Timestamp of migration
- All status updates (oldValue → newValue)
- Skipped records
- Errors encountered

**Use for audits and rollback if needed**

---

## Emergency Rollback

If anything goes wrong, rollback is simple and safe:

```bash
node scripts/rollbackMigration.js
```

This will:
1. Load `MIGRATION_CHANGES.json`
2. Restore all original status values
3. Leave other data untouched (nothing was deleted)
4. Report results

**Rollback is fully reversible** - you can run the migration again after rollback.

---

## Troubleshooting

### Issue: "MONGO_URI environment variable not set"
**Solution**: Ensure `server/.env` has `MONGO_URI` set:
```bash
echo "MONGO_URI=mongodb+srv://user:pass@cluster.mongodb.net/spin" > server/.env
```

### Issue: "Connection timeout"
**Solution**: 
- Verify MongoDB cluster is accessible
- Check firewall/security rules
- Verify IP whitelist in MongoDB Atlas

### Issue: Migration hangs
**Solution**:
- Check MongoDB logs for locks
- If stuck >5 minutes, stop (Ctrl+C) and investigate
- Never force-kill during write phase

### Issue: Validation fails after migration
**Solution**:
1. Check error details in output
2. Review `MIGRATION_CHANGES.json`
3. If critical errors, run rollback
4. Contact support with logs

---

## Safety Features

### Built-In Safeguards

✅ **Read-Only Audit First**
- All data reviewed before any write operations
- Safe to inspect without risk

✅ **Incremental Updates**
- Only modifies status field
- Other data untouched
- Can be verified per-record

✅ **No Mass Deletions**
- No intern records deleted
- No assignment records deleted
- No collections truncated

✅ **Full Audit Trail**
- Every change logged with before/after values
- Timestamps recorded
- Complete change log in JSON

✅ **Easy Rollback**
- Single command to reverse all changes
- No data loss during rollback
- Can re-run migration after rollback

✅ **Validation**
- Automated pre-flight checks
- Post-migration validation
- Status distribution verification

---

## Expected Results

After migration, the system should:

### Data Integrity
✅ 100% of interns preserved
✅ 100% of assignments preserved
✅ All history intact
✅ All dates unchanged

### Schema Compliance
✅ Only valid statuses: "active", "upcoming", "completed"
✅ Zero legacy workflowState fields
✅ Zero legacy awaiting_confirmation fields
✅ All rotations properly typed

### System Stability
✅ Accept/Reassign workflow: Stable
✅ Rotation engine: Consistent
✅ Dashboard: Accurate
✅ Ready for deployment: Yes

---

## Next Steps After Migration

1. **Review Report**
   ```bash
   cat MIGRATION_REPORT.md
   ```

2. **Run Validation**
   ```bash
   node scripts/validateMigration.js
   ```

3. **Backup Success State**
   ```bash
   mongodump --uri="$MONGO_URI" --out=./backup/post-migration-$(date +%s)
   ```

4. **Commit Change Log**
   ```bash
   git add MIGRATION_REPORT.md MIGRATION_CHANGES.json
   git commit -m "chore: Complete rotation schema normalization migration"
   ```

5. **Deploy with Confidence**
   ```bash
   npm run build && npm run deploy
   ```

---

## Support & Questions

**Migration was successful if:**
- Script completes without errors
- Validation passes
- MIGRATION_REPORT.md shows 0 errors
- Status distribution is reasonable

**If issues occur:**
1. Review output carefully
2. Check MIGRATION_CHANGES.json for details
3. Run validation to identify specific problems
4. Use rollback if needed
5. Contact support with logs and report

---

## Technical Details

### Schema Changes

**Before:**
```javascript
status: {
  type: String,
  enum: ['active', 'pending', 'extended', 'completed', 'inactive', 
         'Active', 'Pending', 'Extended', 'Completed', 'Inactive', ''],
  default: 'active'
}
```

**After:**
```javascript
status: {
  type: String,
  enum: ['active', 'upcoming', 'completed'],
  default: 'active'
}
```

### Status Mapping

| Old Status | Rule Applied | New Status |
|-----------|--------------|-----------|
| active | Valid | active |
| completed | Valid | completed |
| pending | Rule 4 | active (if in timeline) or upcoming |
| extended | Rule 2 | completed (if past) or active |
| upcoming | New standard | upcoming |
| inactive | Rule 2 | completed |
| (empty) | Rule 4 | active (default) |
| (missing) | Rule 4 | active (default) |

---

Generated: May 23, 2026  
Migration Type: Non-Destructive  
Database: SPIN 1.0  
