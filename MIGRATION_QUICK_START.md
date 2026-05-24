# SPIN 1.0 - Database Migration: Complete Safe Migration Suite

## 📋 Summary

This package provides a **safe, non-destructive migration** of the SPIN 1.0 MongoDB database to normalize intern rotation statuses to a strict canonical schema.

### 🎯 Objective
Convert all rotation statuses to **only allowed values**:
- ✅ `"active"` - currently assigned, within timeline
- ✅ `"upcoming"` - future start date
- ✅ `"completed"` - ended or past endDate

**Remove legacy fields:**
- ❌ `workflowState`
- ❌ `awaiting_confirmation`

### ✨ Safety Guarantees
- ✅ **Zero data deletion** - All interns preserved, all assignments preserved
- ✅ **Fully reversible** - Complete change log for easy rollback
- ✅ **Audit trail** - Every change logged with before/after values
- ✅ **Validation included** - Automated checks before, during, and after
- ✅ **Read-only first** - Data audited before any writes

---

## 📦 What's Included

### Migration Scripts

| Script | Purpose |
|--------|---------|
| `scripts/preflightCheck.js` | 🟢 Pre-flight verification (RUN FIRST) |
| `scripts/migrateRotationSchema.js` | 🟡 Main migration engine |
| `scripts/validateMigration.js` | 🟢 Post-migration validation |
| `scripts/rollbackMigration.js` | 🔴 Emergency rollback (if needed) |

### Documentation

| Document | Content |
|----------|---------|
| `MIGRATION_PLAYBOOK.md` | Complete execution guide with troubleshooting |
| `MIGRATION_REPORT.md` | Generated after migration - results & metrics |
| `MIGRATION_CHANGES.json` | Generated change log - all modifications |
| `MIGRATION_QUICK_START.md` | This file - quick reference |

---

## 🚀 Quick Start

### Step 1: Pre-Flight Check
```bash
# Navigate to project root
cd /path/to/SPIN\ V1.0

# Run preflight checks
node scripts/preflightCheck.js
```

**Expected output:**
```
✅ PREFLIGHT PASSED

System is ready for migration.

Next steps:
  1. Backup your MongoDB database
  2. Run: node scripts/migrateRotationSchema.js
  3. Run: node scripts/validateMigration.js
  4. Review: MIGRATION_REPORT.md
```

### Step 2: Backup (Critical!)
```bash
# Backup MongoDB cluster (replace with your connection string)
mongodump --uri="$MONGO_URI" --out=./backup/pre-migration-$(date +%s)
```

### Step 3: Execute Migration
```bash
# Run the migration
node scripts/migrateRotationSchema.js
```

**Expected output includes:**
- Read-only data audit (no changes)
- Status normalization (updates only where needed)
- Legacy field removal
- Validation checks
- Summary report

### Step 4: Validate Results
```bash
# Verify migration success
node scripts/validateMigration.js
```

**Expected output:**
```
✅ VALIDATION PASSED - Migration successful!
```

### Step 5: Review Report
```bash
# Check detailed results
cat MIGRATION_REPORT.md
```

---

## 📊 What Gets Updated

### Status Normalization Rules

The migration applies these rules to determine new status:

**Rule 1: Already Valid**
- If status is already "active", "upcoming", or "completed" → Leave unchanged

**Rule 2: Completed Detection**
- If status is "completed", "extended", or "inactive" AND endDate is in past → Set to "completed"

**Rule 3: Future Assignment**
- If startDate > today → Set to "upcoming"

**Rule 4: Currently Active**
- If startDate ≤ today ≤ endDate → Set to "active"

**Rule 5: Default Active**
- If unable to determine (no endDate but past startDate) → Set to "active"

### Example Transformations

```
Rotation 1:
  Before: status = "pending"
  After:  status = "active"    (Rule 4: Currently active)

Rotation 2:
  Before: status = "extended", endDate = 2024-01-01
  After:  status = "completed" (Rule 2: End date in past)

Rotation 3:
  Before: status = "pending", startDate = 2026-06-01
  After:  status = "upcoming"  (Rule 3: Future start date)
```

---

## 🛡️ Safety Features

### Built-In Protections

1. **Read-Only Audit First**
   - All data reviewed before any modifications
   - Logs summary of issues found
   - No changes made during audit

2. **Incremental Updates**
   - Only modifies status field
   - Dates and assignments untouched
   - Can verify each change if needed

3. **No Mass Operations**
   - No bulk deletes
   - No truncations
   - No schema drops

4. **Complete Audit Trail**
   - Every change: `{ internId, rotationId, oldValue, newValue, dates }`
   - Timestamps recorded
   - Exportable change log

5. **Easy Rollback**
   ```bash
   node scripts/rollbackMigration.js
   ```
   - Restores original values
   - No data loss
   - Can re-run migration after rollback

---

## ✅ Post-Migration Verification

### Automated Checks

Run validation script:
```bash
node scripts/validateMigration.js
```

This verifies:
- ✓ Intern count unchanged
- ✓ All statuses valid
- ✓ No legacy fields remain
- ✓ Status distribution reasonable
- ✓ No orphaned records
- ✓ Completed assignments preserved

### Manual Verification (Optional)

Connect to MongoDB and verify:

```javascript
// Should be empty (no invalid statuses)
db.rotations.find({ status: { $nin: ["active", "upcoming", "completed"] } })

// Should be empty (no legacy fields)
db.rotations.find({ workflowState: { $exists: true } })
db.rotations.find({ awaiting_confirmation: { $exists: true } })

// Should show only active, upcoming, completed
db.rotations.aggregate([
  { $group: { _id: "$status", count: { $sum: 1 } } }
])
```

---

## 🔴 Troubleshooting

### Connection Fails
**Error:** `MONGO_URI environment variable not set`

**Solution:**
```bash
# Edit server/.env
echo "MONGO_URI=mongodb+srv://user:pass@cluster.mongodb.net/spin" > server/.env
```

### Migration Hangs
**Error:** Script stops responding

**Solution:**
1. Check MongoDB cluster status
2. Verify network connectivity
3. If stuck >5 minutes, Ctrl+C and investigate
4. Review MongoDB logs

### Validation Fails
**Error:** Invalid statuses or legacy fields still present

**Solution:**
1. Run: `cat MIGRATION_REPORT.md` (check details)
2. Run: `node scripts/rollbackMigration.js` (restore original)
3. Fix underlying issue
4. Re-run migration

---

## 🔄 Rollback Procedure

If anything goes wrong:

```bash
# 1. Stop any running migrations
# (Ctrl+C if script is running)

# 2. Run rollback
node scripts/rollbackMigration.js

# 3. Verify rollback
node scripts/validateMigration.js

# 4. Restore from backup if needed
mongorestore --uri="$MONGO_URI" ./backup/pre-migration-[timestamp]
```

---

## 📈 Expected Results

After successful migration:

### Data Preservation
- ✅ 100% of interns intact
- ✅ 100% of assignments intact
- ✅ All history preserved
- ✅ No gaps in rotation history

### Schema Compliance
- ✅ All statuses: "active", "upcoming", or "completed"
- ✅ Zero workflowState fields
- ✅ Zero awaiting_confirmation fields
- ✅ Proper MongoDB ObjectIds

### System Stability
- ✅ Accept/Reassign workflow works
- ✅ Dashboard shows accurate data
- ✅ Rotation engine consistent
- ✅ Ready for production deployment

---

## 📋 Files Generated

### After Migration

**1. MIGRATION_REPORT.md**
```
- Execution metrics
- Changes applied
- Validation results
- System state
- Next steps
```

**2. MIGRATION_CHANGES.json**
```json
{
  "timestamp": "2026-05-23T10:30:00Z",
  "changes": [
    {
      "type": "STATUS_UPDATE",
      "internId": "...",
      "internName": "John Doe",
      "rotationId": "...",
      "oldValue": "pending",
      "newValue": "active"
    }
  ],
  "errors": []
}
```

---

## ⏱️ Estimated Duration

| Phase | Duration |
|-------|----------|
| Preflight check | 1-2 minutes |
| Backup | 2-5 minutes |
| Migration | 5-15 minutes |
| Validation | 1-2 minutes |
| **Total** | **10-25 minutes** |

*(Depends on data volume and MongoDB connection speed)*

---

## 🚫 What Will NOT Happen

- ❌ Intern records deleted
- ❌ Assignment records deleted
- ❌ Collections truncated
- ❌ Dates modified
- ❌ Assignment order changed
- ❌ History data lost
- ❌ Database reset

---

## ✨ Next Steps After Migration

1. **Review Results**
   ```bash
   cat MIGRATION_REPORT.md
   ```

2. **Backup Success State**
   ```bash
   mongodump --uri="$MONGO_URI" --out=./backup/post-migration-$(date +%s)
   ```

3. **Commit Changes**
   ```bash
   git add MIGRATION_REPORT.md MIGRATION_CHANGES.json
   git commit -m "chore: Complete rotation schema normalization migration"
   ```

4. **Update Intern Schema (Optional)**
   - Optionally update `server/models/Intern.js` to also restrict to valid statuses
   - Not required - migration is complete without this

5. **Deploy with Confidence**
   ```bash
   npm run build
   npm run deploy
   ```

---

## 📞 Support

### If Migration Succeeds
✅ Review MIGRATION_REPORT.md
✅ Run node scripts/validateMigration.js one more time
✅ Proceed to deployment

### If Issues Occur
1. ✓ Read error message carefully
2. ✓ Check MIGRATION_REPORT.md details
3. ✓ Run validation: node scripts/validateMigration.js
4. ✓ If needed: node scripts/rollbackMigration.js
5. ✓ Investigate root cause
6. ✓ Re-run when ready

---

## 🎓 Technical Details

### Schema Before
```javascript
status: {
  type: String,
  enum: ['active', 'pending', 'extended', 'completed', 'inactive', 
         'Active', 'Pending', 'Extended', 'Completed', 'Inactive', ''],
  default: 'active'
}
```

### Schema After
```javascript
status: {
  type: String,
  enum: ['active', 'upcoming', 'completed'],
  default: 'active'
}
```

### Status Mapping Table
| Old | Condition | New |
|-----|-----------|-----|
| active | Valid | active |
| completed | Valid | completed |
| upcoming | New standard | upcoming |
| pending | In timeline | active |
| pending | Future | upcoming |
| extended | Past end | completed |
| inactive | Any | completed |

---

## ✅ Migration Checklist

Before running:
- [ ] Read this document
- [ ] Run preflightCheck.js
- [ ] Backup MongoDB
- [ ] Set MONGO_URI environment variable
- [ ] Verify MongoDB connectivity

During:
- [ ] Monitor migration progress
- [ ] Don't interrupt the script
- [ ] Check for errors in output

After:
- [ ] Run validateMigration.js
- [ ] Review MIGRATION_REPORT.md
- [ ] Backup success state
- [ ] Commit changes
- [ ] Deploy to production

---

## 📅 Version Info
- **SPIN Version**: 1.0
- **Migration Date**: May 23, 2026
- **Type**: Safe, Non-Destructive
- **Status**: Production Ready

---

For detailed information, see: `MIGRATION_PLAYBOOK.md`
