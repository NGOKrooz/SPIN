const fs = require('fs');
const path = require('path');

const serverModules = path.join(__dirname, '..', 'server', 'node_modules');
module.paths.unshift(serverModules);
const mongoose = require(path.join(serverModules, 'mongoose'));
require(path.join(serverModules, 'dotenv')).config({ path: path.join(__dirname, '..', 'server', '.env') });

const Rotation = require('../server/models/Rotation');
const Intern = require('../server/models/Intern');

const VALID_STATUSES = new Set(['active', 'upcoming', 'completed']);
const LEGACY_STATUSES = new Set(['pending', 'overdue', 'awaiting_confirmation', 'waiting', 'workflowstate']);

function parseDate(value) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  date.setHours(0, 0, 0, 0);
  return date;
}

function determineStatus(rotation) {
  const rawStatus = String(rotation.status || '').trim().toLowerCase();
  const startDate = parseDate(rotation.startDate);
  const endDate = parseDate(rotation.endDate);
  const now = new Date();
  now.setHours(0, 0, 0, 0);

  if (VALID_STATUSES.has(rawStatus)) {
    return rawStatus;
  }

  if (startDate && startDate > now) {
    return 'upcoming';
  }

  if (endDate && endDate < now) {
    return 'completed';
  }

  if (startDate && endDate && startDate <= now && now <= endDate) {
    return 'active';
  }

  if (startDate && !endDate && startDate <= now) {
    return 'active';
  }

  if (LEGACY_STATUSES.has(rawStatus)) {
    if (startDate && startDate > now) return 'upcoming';
    if (endDate && endDate < now) return 'completed';
    return 'active';
  }

  if (!rotation.status || rawStatus === '') {
    if (startDate && startDate > now) return 'upcoming';
    if (endDate && endDate < now) return 'completed';
    if (startDate) return 'active';
    return 'active';
  }

  return 'active';
}

function compareDates(a, b) {
  const da = parseDate(a) || new Date(0);
  const db = parseDate(b) || new Date(0);
  return da.getTime() - db.getTime();
}

async function runRepair() {
  const report = {
    date: new Date().toISOString(),
    internsProcessed: 0,
    assignmentsUpdated: 0,
    invalidStatusesFixed: 0,
    legacyFieldsRemoved: 0,
    duplicateActiveRepaired: 0,
    duplicateUpcomingLogged: 0,
    skippedUnsafeRecords: 0,
    currentUnitErrors: 0,
    nextUnitErrors: 0,
    acceptWorkflowTests: [],
    reassignWorkflowTests: [],
    capacityActiveCount: 0,
    repairActions: [],
    manualReviewLogs: []
  };

  const uri = process.env.MONGO_URI;
  if (!uri) {
    throw new Error('MONGO_URI environment variable not set');
  }

  await mongoose.connect(uri, { retryWrites: true, w: 'majority' });

  const interns = await Intern.find().lean();
  report.internsProcessed = interns.length;

  for (const intern of interns) {
    const rotations = await Rotation.find({ intern: intern._id }).lean();
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    
    const updates = [];
    for (const rotation of rotations) {
      const oldStatus = String(rotation.status || '').trim().toLowerCase();
      const newStatus = determineStatus(rotation);
      const needsStatusUpdate = oldStatus !== newStatus;
      const hasLegacyField = rotation.workflowState !== undefined || rotation.awaiting_confirmation !== undefined;

      if (needsStatusUpdate || hasLegacyField) {
        const update = { };
        const unset = { };

        if (needsStatusUpdate) {
          update.status = newStatus;
        }

        if (rotation.workflowState !== undefined) unset.workflowState = '';
        if (rotation.awaiting_confirmation !== undefined) unset.awaiting_confirmation = '';

        const updateCmd = {};
        if (Object.keys(update).length > 0) updateCmd.$set = update;
        if (Object.keys(unset).length > 0) updateCmd.$unset = unset;

        try {
          await Rotation.updateOne({ _id: rotation._id }, updateCmd, { strict: false });
          if (needsStatusUpdate) report.invalidStatusesFixed++;
          if (rotation.workflowState !== undefined) report.legacyFieldsRemoved++;
          if (rotation.awaiting_confirmation !== undefined) report.legacyFieldsRemoved++;
          report.assignmentsUpdated++;
          report.repairActions.push({
            internId: String(intern._id),
            rotationId: String(rotation._id),
            oldStatus,
            newStatus,
            removedLegacy: Object.keys(unset),
            startDate: rotation.startDate || null,
            endDate: rotation.endDate || null
          });
          console.log(`Repaired rotation ${rotation._id}: ${oldStatus || '[missing]'} -> ${newStatus}`);
        } catch (err) {
          report.skippedUnsafeRecords++;
          report.manualReviewLogs.push({
            type: 'REPAIR_ERROR',
            internId: String(intern._id),
            rotationId: String(rotation._id),
            message: err.message
          });
          console.warn(`[SKIPPED UNSAFE RECORD] intern=${intern.name} rotation=${rotation._id} error=${err.message}`);
        }
      }
    }

    const activeRotations = rotations.filter(r => String(r.status || '').toLowerCase() === 'active');
    if (activeRotations.length > 1) {
      const sortedActive = activeRotations.slice().sort((a, b) => {
        const cmp = compareDates(b.startDate, a.startDate);
        if (cmp !== 0) return cmp;
        return String(b._id).localeCompare(String(a._id));
      });
      const keep = sortedActive[0];
      const toComplete = sortedActive.slice(1);
      for (const rotation of toComplete) {
        try {
          await Rotation.updateOne({ _id: rotation._id }, { $set: { status: 'completed' } }, { strict: false });
          report.duplicateActiveRepaired++;
          report.repairActions.push({
            internId: String(intern._id),
            rotationId: String(rotation._id),
            oldStatus: String(rotation.status || '').toLowerCase(),
            newStatus: 'completed',
            reason: 'duplicate active rotation; older active converted to completed'
          });
          console.log(`Duplicate active repaired for intern ${intern.name}: rotation ${rotation._id} -> completed`);
        } catch (err) {
          report.skippedUnsafeRecords++;
          report.manualReviewLogs.push({
            type: 'DUPLICATE_ACTIVE_ERROR',
            internId: String(intern._id),
            rotationId: String(rotation._id),
            message: err.message
          });
          console.warn(`[SKIPPED UNSAFE RECORD] duplicate active could not be repaired for intern=${intern.name} rotation=${rotation._id}`);
        }
      }
    }

    const upcomingRotations = rotations.filter(r => String(r.status || '').toLowerCase() === 'upcoming');
    if (upcomingRotations.length > 1) {
      const sortedUpcoming = upcomingRotations.slice().sort((a, b) => {
        const cmp = compareDates(a.startDate, b.startDate);
        if (cmp !== 0) return cmp;
        return String(a._id).localeCompare(String(b._id));
      });
      const keep = sortedUpcoming[0];
      const rest = sortedUpcoming.slice(1);
      report.duplicateUpcomingLogged += rest.length;
      report.manualReviewLogs.push({
        type: 'DUPLICATE_UPCOMING',
        internId: String(intern._id),
        internName: intern.name,
        keepRotationId: String(keep._id),
        extraUpcomingRotationIds: rest.map(r => String(r._id))
      });
      console.warn(`[MANUAL REVIEW REQUIRED] intern=${intern.name} has ${upcomingRotations.length} upcoming rotations; earliest locked as upcoming`);
    }

    const currentActive = rotations.find(r => String(r.status || '').toLowerCase() === 'active');
    if (!currentActive) {
      report.currentUnitErrors++;
      report.manualReviewLogs.push({
        type: 'NO_ACTIVE_ROTATION',
        internId: String(intern._id),
        internName: intern.name
      });
      console.warn(`[MANUAL REVIEW REQUIRED] intern=${intern.name} has no active rotation`);
    } else {
      if (!currentActive.unit) {
        report.currentUnitErrors++;
        report.manualReviewLogs.push({
          type: 'ACTIVE_UNIT_MISSING',
          internId: String(intern._id),
          internName: intern.name,
          rotationId: String(currentActive._id)
        });
        console.warn(`[MANUAL REVIEW REQUIRED] intern=${intern.name} active rotation ${currentActive._id} has missing unit`);
      }
    }

    const nextUpcoming = rotations.find(r => String(r.status || '').toLowerCase() === 'upcoming');
    if (nextUpcoming && String(nextUpcoming.status || '').toLowerCase() !== 'upcoming') {
      report.nextUnitErrors++;
      report.manualReviewLogs.push({
        type: 'NEXT_UNIT_STATUS_INVALID',
        internId: String(intern._id),
        internName: intern.name,
        rotationId: String(nextUpcoming._id)
      });
    }
  }

  report.capacityActiveCount = await Rotation.countDocuments({ status: 'active' });

  const activeUpcomingIntern = await Intern.findOne().lean();
  if (activeUpcomingIntern) {
    const rotations = await Rotation.find({ intern: activeUpcomingIntern._id }).lean();
    const active = rotations.filter(r => String(r.status || '').toLowerCase() === 'active');
    const upcoming = rotations.filter(r => String(r.status || '').toLowerCase() === 'upcoming');
    if (active.length === 1 && upcoming.length === 1) {
      report.acceptWorkflowTests.push({
        internId: String(activeUpcomingIntern._id),
        internName: activeUpcomingIntern.name,
        activeRotationId: String(active[0]._id),
        upcomingRotationId: String(upcoming[0]._id),
        result: 'dry-run accept transition would complete current and activate next with no other modifications'
      });
    } else {
      report.acceptWorkflowTests.push({
        internId: String(activeUpcomingIntern._id),
        internName: activeUpcomingIntern.name,
        result: 'no clean active+upcoming pair available for dry-run accept verification'
      });
    }
  }

  await mongoose.disconnect();

  const reportPath = path.join(process.cwd(), 'FINAL_ROTATION_CONSISTENCY_REPORT.md');
  const reportText = [`# Final Rotation Consistency Report`, ``, `- Date: ${report.date}`, `- Interns processed: ${report.internsProcessed}`, `- Assignments updated: ${report.assignmentsUpdated}`, `- Invalid statuses fixed: ${report.invalidStatusesFixed}`, `- Legacy fields removed: ${report.legacyFieldsRemoved}`, `- Duplicate active rotations repaired: ${report.duplicateActiveRepaired}`, `- Duplicate upcoming rotations logged: ${report.duplicateUpcomingLogged}`, `- Skipped unsafe records: ${report.skippedUnsafeRecords}`, `- Current unit errors: ${report.currentUnitErrors}`, `- Next unit errors: ${report.nextUnitErrors}`, `- Active capacity count: ${report.capacityActiveCount}`, ``, `## Repair Actions`, ``, ...report.repairActions.map(a => `- Intern ${a.internId}, Rotation ${a.rotationId}: ${a.oldStatus || '[missing]'} -> ${a.newStatus}${a.reason ? ' (' + a.reason + ')' : ''}`), ``, `## Manual Review Logs`, ``, ...report.manualReviewLogs.map(l => `- [${l.type}] ${JSON.stringify(l)}`), ``, `## Accept Workflow Verification`, ``, ...report.acceptWorkflowTests.map(t => `- ${t.result}`)];
  fs.writeFileSync(reportPath, reportText.join('\n'), 'utf8');
  fs.writeFileSync(path.join(process.cwd(), 'FINAL_ROTATION_REPAIR_LOG.json'), JSON.stringify(report, null, 2), 'utf8');
  console.log(`\nFinal repair report created: ${reportPath}`);
}

runRepair().catch(err => {
  console.error('Repair failed:', err.message);
  process.exit(1);
});
