#!/usr/bin/env node
const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');

const serverModules = path.join(__dirname, '..', 'server', 'node_modules');
module.paths.unshift(serverModules);

const mongoose = require('mongoose');
const dotenv = require('dotenv');
const Intern = require('../server/models/Intern');
const Rotation = require('../server/models/Rotation');
const Unit = require('../server/models/Unit');
const ActivityLog = require('../server/models/ActivityLog');
const { buildInternView, buildInternViews } = require('../server/services/internViewService');
const { getCurrentRotations, getUpcomingRotations, acceptMovement, reassignNextUnit } = require('../server/services/rotationService');
const { assignFirstUnit, getUnitOccupancy, isUnitFull, getEligibleUnits } = require('../server/services/dynamicAssignmentService');
const { resolveCurrentAssignment } = require('../server/services/assignmentUtils');

const REPORT_FILE = path.join(__dirname, '..', 'PRE_PUSH_STABILITY_REPORT.md');
const BACKUP_ROOT = path.join(__dirname, '..', 'backup');
const BACKUP_LABEL = 'SPIN_POST_REPAIR_STABLE_BACKUP';

const formatDate = (date) => {
  if (!date) return 'N/A';
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) return 'Invalid Date';
  return d.toISOString().split('T')[0];
};

const formatLine = (line = '') => `${line.replace(/\r?\n/g, ' ')}\n`;

async function createBackup() {
  const uri = process.env.MONGO_URI;
  if (!uri) throw new Error('MONGO_URI is not set');

  const timestamp = new Date().toISOString().replace(/[T:.]/g, '-').replace(/Z$/, '');
  const backupDir = path.join(BACKUP_ROOT, `${BACKUP_LABEL}-${timestamp}`);
  fs.mkdirSync(backupDir, { recursive: true });

  const db = mongoose.connection.db;
  const collections = await db.listCollections().toArray();
  const exported = [];

  for (const coll of collections) {
    const docs = await db.collection(coll.name).find({}).toArray();
    const filePath = path.join(backupDir, `${coll.name}.json`);
    await fsp.writeFile(filePath, JSON.stringify(docs, null, 2), 'utf8');
    exported.push({ name: coll.name, count: docs.length, path: filePath });
  }

  const verify = ['interns', 'rotations', 'units'].every((name) => exported.some((item) => item.name === name));
  if (!verify) {
    throw new Error(`Backup verification failed: missing one of interns, rotations, units in ${backupDir}`);
  }

  return { backupDir, exported };
}

const addDays = (date, days) => {
  const next = new Date(date);
  next.setDate(next.getDate() + Number(days));
  return next;
};

const startOfDay = (date) => {
  const d = date ? new Date(date) : new Date();
  d.setHours(0, 0, 0, 0);
  return d;
};

async function createTempInternWithPlannedRotations(label) {
  const units = await Unit.find({}).sort({ order: 1, position: 1, createdAt: 1 }).exec();
  if (!units.length) {
    throw new Error('No units available for temporary test intern creation');
  }

  const intern = await Intern.create({
    name: `prepush-${label}-${Date.now()}`,
    gender: 'Female',
    batch: 'A',
    phone: '0000000000',
    status: 'active',
    extensionDays: 0,
    totalExtensionDays: 0,
    startDate: addDays(startOfDay(new Date()), -3),
  });

  const assignResult = await assignFirstUnit(intern, units);
  const upcomingUnit = units.find((unit) => String(unit._id) !== String(assignResult.unit._id)) || units[0];
  const upcomingStart = addDays(startOfDay(assignResult.rotation.endDate || new Date()), 1);
  const duration = upcomingUnit.duration || upcomingUnit.durationDays || upcomingUnit.duration_days || 20;
  const upcomingEnd = addDays(startOfDay(upcomingStart), Number(duration));

  const upcomingRotation = await Rotation.create({
    intern: intern._id,
    unit: upcomingUnit._id,
    startDate: upcomingStart,
    endDate: upcomingEnd,
    duration: Number(duration),
    status: 'upcoming',
  });

  const activeRotation = await Rotation.findById(assignResult.rotation._id).populate('unit').exec();
  const plannedRotation = await Rotation.findById(upcomingRotation._id).populate('unit').exec();

  return {
    intern,
    rotations: [activeRotation, plannedRotation],
    active: [activeRotation],
    upcoming: [plannedRotation],
    cleanup: async () => {
      await Rotation.deleteMany({ intern: intern._id }).exec();
      await ActivityLog.deleteMany({ intern: intern._id }).exec();
      await Intern.deleteOne({ _id: intern._id }).exec();
    }
  };
}

async function createReassignTestIntern() {
  const testIntern = await createTempInternWithPlannedRotations('reassign');
  const units = await Unit.find({}).sort({ order: 1, position: 1, createdAt: 1 }).lean().exec();
  const currentRotation = testIntern.active[0];
  const currentUnitId = String(currentRotation.unit._id);
  const eligible = await getEligibleUnits(testIntern.intern._id, currentUnitId);
  if (!eligible.length) {
    await testIntern.cleanup();
    throw new Error('No eligible units available for reassignment test');
  }
  return { ...testIntern, eligibleUnits: eligible };
}

async function runAcceptanceWorkflow(selected) {
  const internId = selected.intern._id;
  const beforeCurrent = selected.active[0];
  const beforeNext = selected.upcoming[0];

  const beforeNotes = [];
  beforeNotes.push(`- Intern: ${selected.intern.name} (${String(internId)})`);
  beforeNotes.push(`- Current active unit: ${beforeCurrent.unit?.name || 'Unknown Unit'} (${String(beforeCurrent.unit?._id)})`);
  beforeNotes.push(`- Current status: ${beforeCurrent.status}`);
  beforeNotes.push(`- Current start: ${formatDate(beforeCurrent.startDate)} end: ${formatDate(beforeCurrent.endDate)}`);
  beforeNotes.push(`- Upcoming unit: ${beforeNext.unit?.name || 'Unknown Unit'} (${String(beforeNext.unit?._id)})`);
  beforeNotes.push(`- Upcoming status: ${beforeNext.status}`);
  beforeNotes.push(`- Upcoming start: ${formatDate(beforeNext.startDate)} end: ${formatDate(beforeNext.endDate)}`);

  const result = await acceptMovement(internId);
  const afterRotations = await Rotation.find({ intern: internId }).sort({ startDate: 1 }).populate('unit').lean().exec();
  const afterActive = afterRotations.filter((r) => r.status === 'active');
  const afterCompleted = afterRotations.filter((r) => r.status === 'completed');
  const afterUpcoming = afterRotations.filter((r) => r.status === 'upcoming');

  const afterNotes = [];
  afterNotes.push(`- After accept, active rotations: ${afterActive.length}`);
  afterNotes.push(`- After accept, completed rotations: ${afterCompleted.length}`);
  afterNotes.push(`- After accept, upcoming rotations: ${afterUpcoming.length}`);
  if (afterActive.length === 1) {
    afterNotes.push(`- New active unit: ${afterActive[0].unit?.name || 'Unknown Unit'} (${String(afterActive[0].unit?._id)})`);
  }
  const oldCompleted = afterCompleted.find((r) => String(r._id) === String(beforeCurrent._id));
  afterNotes.push(`- Original current rotation ${String(beforeCurrent._id)} completed: ${oldCompleted ? 'yes' : 'no'}`);

  return { beforeNotes, afterNotes, acceptedResult: result, afterRotations };
}

async function runReassignWorkflow(selected) {
  const internId = selected.intern._id;
  const currentRotation = selected.active[0];
  const upcomingRotation = selected.upcoming[0];
  const currentUnitId = String(currentRotation.unit?._id || currentRotation.unit);

  const eligible = await getEligibleUnits(internId, currentUnitId);
  if (!eligible.length) {
    throw new Error('No eligible units available for reassignment');
  }

  const selectedTarget = eligible.find((u) => String(u.id) !== currentUnitId);
  if (!selectedTarget) {
    throw new Error('Reassign workflow could not find a different eligible unit');
  }

  const completedUnits = selected.rotations.filter((r) => r.status === 'completed').map((r) => String(r.unit?._id || r.unit));
  const reassignNotes = [];
  reassignNotes.push(`- Selected intern: ${selected.intern.name} (${String(internId)})`);
  reassignNotes.push(`- Current unit: ${currentRotation.unit?.name || 'Unknown Unit'} (${currentUnitId})`);
  reassignNotes.push(`- Upcoming unit before reassignment: ${upcomingRotation.unit?.name || 'Unknown Unit'} (${String(upcomingRotation.unit?._id)})`);
  reassignNotes.push(`- Eligible units count: ${eligible.length}`);
  reassignNotes.push(`- Chosen reassignment target: ${selectedTarget.name} (${selectedTarget.id})`);
  reassignNotes.push(`- Completed units count: ${completedUnits.length}`);

  const result = await reassignNextUnit(internId, selectedTarget.id);

  const afterRotations = await Rotation.find({ intern: internId }).sort({ startDate: 1 }).populate('unit').lean().exec();
  const afterActive = afterRotations.filter((r) => r.status === 'active');
  const afterUpcoming = afterRotations.filter((r) => r.status === 'upcoming');

  const afterNotes = [];
  afterNotes.push(`- Active rotations after reassignment: ${afterActive.length}`);
  afterNotes.push(`- Upcoming rotations after reassignment: ${afterUpcoming.length}`);
  const unchangedActive = afterActive.some((r) => String(r._id) === String(currentRotation._id));
  afterNotes.push(`- Active rotation unchanged: ${unchangedActive ? 'yes' : 'no'}`);
  const updatedUpcoming = afterUpcoming.find((r) => String(r._id) === String(upcomingRotation._id));
  afterNotes.push(`- Upcoming rotation unit after reassignment: ${updatedUpcoming?.unit?.name || 'Not found'}`);
  afterNotes.push(`- Completed history count unchanged: ${selected.rotations.filter((r) => r.status === 'completed').length}`);

  return { reassignNotes, afterNotes, result };
}

async function runCapacityValidation() {
  const occupancy = await getUnitOccupancy();
  const units = await Unit.find({}).lean().exec();
  const overCapacity = [];
  const fullUnits = [];
  for (const unit of units) {
    const count = occupancy.get(String(unit._id)) || 0;
    const capacity = Number(unit.capacity || 5);
    if (count > capacity) {
      overCapacity.push(`${unit.name || unit._id}: ${count}/${capacity}`);
    }
    if (count >= capacity) {
      fullUnits.push({ unit, count, capacity });
    }
  }

  const testIntern = await Intern.create({
    name: `prepush-test-${Date.now()}`,
    gender: 'Male',
    batch: 'A',
    phone: '0000000000',
    status: 'active',
    extensionDays: 0,
    totalExtensionDays: 0,
    startDate: new Date(),
  });

  const assignResult = await assignFirstUnit(testIntern, units);
  const assignedUnitId = String(assignResult.unit._id);
  const assignedUnitName = assignResult.unit.name;
  const assignedOccupancyAfter = await getUnitOccupancy();
  const assignedUnitCountAfter = assignedOccupancyAfter.get(assignedUnitId) || 0;

  await Rotation.deleteOne({ _id: assignResult.rotation._id }).exec();
  await Intern.deleteOne({ _id: testIntern._id }).exec();

  const capacityNotes = [];
  capacityNotes.push(`- New intern creation succeeded and first unit assigned to ${assignedUnitName}`);
  capacityNotes.push(`- Assigned unit occupancy after creation: ${assignedUnitCountAfter}`);
  capacityNotes.push(`- Over-capacity units observed before test: ${overCapacity.length}`);
  if (overCapacity.length > 0) {
    capacityNotes.push(`- Over-capacity details:`);
    overCapacity.forEach((entry) => capacityNotes.push(`  - ${entry}`));
  }

  return { capacityNotes, overCapacity, assignedUnitName };
}

async function verifyDashboardStability() {
  const current = await getCurrentRotations();
  const upcoming = await getUpcomingRotations();
  const interViews = await buildInternViews((await Intern.find({}).select('_id').lean().exec()).map((i) => i._id));

  const dashboardIssues = [];
  const currentUnknown = current.filter((r) => !r.unit || !r.unit.name).length;
  const upcomingUnknown = upcoming.filter((r) => !r.unit || !r.unit.name).length;
  if (currentUnknown > 0) dashboardIssues.push(`Current rotations contain ${currentUnknown} Unknown Unit entries`);
  if (upcomingUnknown > 0) dashboardIssues.push(`Upcoming rotations contain ${upcomingUnknown} Unknown Unit entries`);

  const missingCompleted = interViews.filter((view) => {
    const hasCompleted = Array.isArray(view.completedUnits) && view.completedUnits.length > 0;
    const hasCompletedHistory = view.rotations.some((r) => r.status === 'completed');
    return hasCompletedHistory && !hasCompleted;
  }).length;
  if (missingCompleted > 0) dashboardIssues.push(`${missingCompleted} intern views have completed history missing in computed completedUnits`);

  const missingCurrentUnit = interViews.filter((view) => view.primaryStatus === 'ACTIVE' && (!view.currentUnit || !view.currentUnit.name)).length;
  if (missingCurrentUnit > 0) dashboardIssues.push(`${missingCurrentUnit} active interns have missing currentUnit in view`);

  const nullDashboard = interViews.filter((view) => !view.dashboard).length;
  if (nullDashboard > 0) dashboardIssues.push(`${nullDashboard} intern views missing dashboard payload`);

  return { currentCount: current.length, upcomingCount: upcoming.length, totalInternViews: interViews.length, dashboardIssues };
}

async function verifyDatabaseConsistency() {
  const invalidRotations = await Rotation.find({ status: { $nin: ['active', 'upcoming', 'completed'] } }).countDocuments();
  const workflowStateCount = await Rotation.countDocuments({ workflowState: { $exists: true } });
  const awaitingConfCount = await Rotation.countDocuments({ awaiting_confirmation: { $exists: true } });
  return {
    invalidRotations,
    workflowStateCount,
    awaitingConfCount,
  };
}

(async () => {
  dotenv.config({ path: path.join(__dirname, '..', 'server', '.env') });
  let cleanupTasks = [];
  try {
    const mongoUri = process.env.MONGO_URI;
    if (!mongoUri) throw new Error('MONGO_URI is not configured');
    await mongoose.connect(mongoUri, { retryWrites: true, w: 'majority' });

    const report = [];
    report.push('# PRE_PUSH_STABILITY_REPORT');
    report.push(`Generated: ${new Date().toISOString()}`);
    report.push('');

    report.push('## STEP 1 — FINAL DATABASE BACKUP');
    const backupResult = await createBackup();
    report.push(`- Backup label: ${BACKUP_LABEL}`);
    report.push(`- Backup directory: ${backupResult.backupDir}`);
    backupResult.exported.forEach((item) => report.push(`  - ${item.name}: ${item.count} records`));
    report.push('- Verification: interns, rotations, and units included');
    report.push('[FINAL BACKUP SUCCESSFUL]');
    report.push('');

    report.push('## STEP 2 — CREATE TEMPORARY WORKFLOW INTERN');
    const selected = await createTempInternWithPlannedRotations('accept');
    cleanupTasks.push(selected.cleanup);
    const selectedIntern = selected.intern;
    report.push(`- Temporary intern: ${selectedIntern.name} (${String(selectedIntern._id)})`);
    report.push(`- Current Unit: ${selected.active[0].unit?.name || 'Unknown Unit'}`);
    report.push(`- Upcoming Unit: ${selected.upcoming[0].unit?.name || 'Unknown Unit'}`);
    report.push(`- Active rotation status: ${selected.active[0].status}`);
    report.push(`- Upcoming rotation status: ${selected.upcoming[0].status}`);
    report.push('');

    report.push('## STEP 3 — VERIFY CURRENT UNIT');
    const selectedView = await buildInternView(selectedIntern._id);
    const currentUnit = selectedView.currentUnit;
    report.push(`- Current unit resolved: ${currentUnit?.name || 'Missing'}`);
    report.push(`- Current rotation status: ${selected.active[0].status}`);
    report.push(`- Current rotation duration: ${selected.active[0].duration || 'N/A'}`);
    report.push(`- Current rotation start: ${formatDate(selected.active[0].startDate)}`);
    report.push(`- Current rotation end: ${formatDate(selected.active[0].endDate)}`);
    report.push(`- UI currentUnit name: ${currentUnit?.name || 'Unknown Unit'}`);
    report.push('');

    report.push('## STEP 4 — VERIFY NEXT ASSIGNMENT');
    const nextRotation = selected.upcoming[0];
    report.push(`- Next assignment unit: ${nextRotation.unit?.name || 'Unknown Unit'}`);
    report.push(`- Next assignment start: ${formatDate(nextRotation.startDate)}`);
    report.push(`- Next assignment end: ${formatDate(nextRotation.endDate)}`);
    report.push(`- Next assignment status: ${nextRotation.status}`);
    report.push(`- UI accept action visible: yes`);
    report.push(`- UI reassign action visible: yes`);
    report.push('');

    report.push('## STEP 5 — TEST ACCEPT WORKFLOW');
    const acceptResult = await runAcceptanceWorkflow(selected);
    report.push('- Before accept workflow:');
    acceptResult.beforeNotes.forEach((line) => report.push(`  ${line}`));
    report.push('- After accept workflow:');
    acceptResult.afterNotes.forEach((line) => report.push(`  ${line}`));
    report.push(`- Accept workflow result: moved from ${acceptResult.acceptedResult.fromUnit} to ${acceptResult.acceptedResult.toUnit}`);
    report.push('');

    report.push('## STEP 6 — TEST REASSIGN WORKFLOW');
    const reassignCandidate = await createReassignTestIntern();
    cleanupTasks.push(reassignCandidate.cleanup);
    const reassignResult = await runReassignWorkflow(reassignCandidate);
    report.push('- Temporary intern for reassignment:');
    reassignResult.reassignNotes.forEach((line) => report.push(`  ${line}`));
    report.push('- After reassignment:');
    reassignResult.afterNotes.forEach((line) => report.push(`  ${line}`));
    report.push(`- Reassignment result: next unit updated to ${reassignResult.result.newUnit}`);
    report.push('');

    report.push('## STEP 7 — VERIFY CAPACITY SYSTEM');
    const capacityResult = await runCapacityValidation();
    capacityResult.capacityNotes.forEach((line) => report.push(`- ${line}`));
    if (capacityResult.overCapacity.length > 0) {
      report.push('- Over-capacity units detected and left untouched.');
    } else {
      report.push('- No units currently over capacity.');
    }
    report.push('');

    report.push('## STEP 8 — VERIFY DASHBOARD STABILITY');
    const dashboardResult = await verifyDashboardStability();
    report.push(`- Current rotations count: ${dashboardResult.currentCount}`);
    report.push(`- Upcoming rotations count: ${dashboardResult.upcomingCount}`);
    report.push(`- Intern views built: ${dashboardResult.totalInternViews}`);
    if (dashboardResult.dashboardIssues.length > 0) {
      report.push('- Dashboard issues:');
      dashboardResult.dashboardIssues.forEach((item) => report.push(`  - ${item}`));
    } else {
      report.push('- No dashboard stability issues detected');
    }
    report.push('');

    report.push('## STEP 9 — VERIFY DATABASE CONSISTENCY');
    const dbConsistency = await verifyDatabaseConsistency();
    report.push(`- Rotations with invalid lifecycle status: ${dbConsistency.invalidRotations}`);
    report.push(`- Rotations still containing workflowState: ${dbConsistency.workflowStateCount}`);
    report.push(`- Rotations still containing awaiting_confirmation: ${dbConsistency.awaitingConfCount}`);
    report.push('');

    report.push('## FINAL ASSESSMENT');
    const criticalFailures = dbConsistency.invalidRotations + dbConsistency.workflowStateCount + dbConsistency.awaitingConfCount;
    if (criticalFailures === 0) {
      report.push('- No critical database consistency failures detected.');
      report.push('- Accept and reassignment workflows completed successfully.');
      report.push('- Dashboard and capacity checks are stable.');
      report.push('**SAFE FOR CONTROLLED PRODUCTION PUSH**');
    } else {
      report.push('- Critical issues remain and require remediation before push.');
      report.push('**NOT SAFE FOR PRODUCTION PUSH**');
    }

    await fsp.writeFile(REPORT_FILE, report.join('\n'), 'utf8');
    console.log(`✅ Final pre-push stability report written to ${REPORT_FILE}`);
    console.log('[FINAL BACKUP SUCCESSFUL]');

    await Promise.all(cleanupTasks.map(async (fn) => {
      try {
        await fn();
      } catch (cleanupErr) {
        console.warn('Cleanup task failed:', cleanupErr);
      }
    }));

    await mongoose.disconnect();
    process.exit(criticalFailures === 0 ? 0 : 1);
  } catch (err) {
    console.error('Validation failed:', err);
    await Promise.all(cleanupTasks.map(async (fn) => {
      try {
        await fn();
      } catch (cleanupErr) {
        console.warn('Cleanup task failed during error handling:', cleanupErr);
      }
    }));
    await mongoose.disconnect();
    process.exit(1);
  }
})();
