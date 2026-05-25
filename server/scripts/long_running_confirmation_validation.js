const express = require('express');
const request = require('supertest');
const mongoose = require('mongoose');
const fs = require('fs');
const { MongoMemoryServer } = require('mongodb-memory-server');
const { addDays, startOfDay } = require('date-fns');

const Intern = require('../models/Intern');
const Rotation = require('../models/Rotation');
const Unit = require('../models/Unit');
const ActivityLog = require('../models/ActivityLog');

const internsRouter = require('../routes/interns');
const rotationsRouter = require('../routes/rotations');
const rotationPlanService = require('../services/rotationPlanService');

const CYCLES = Number(process.env.LONG_RUN_CYCLES) || 50;
const INTERN_COUNT = Number(process.env.LONG_RUN_INTERN_COUNT) || 4;
const REASSIGN_EVERY = 7; // every N cycles do a reassignment/accept

const createApp = () => {
  const app = express();
  app.use(express.json());
  app.use('/api/interns', internsRouter);
  app.use('/api/rotations', rotationsRouter);
  app.use('/api/activity', require('../routes/activity'));
  return app;
};

const createSampleUnits = async () => {
  await Unit.deleteMany({}).exec();
  const units = [
    { name: 'Cardiology', order: 1, position: 1, duration: 20 },
    { name: 'Neurology', order: 2, position: 2, duration: 20 },
    { name: 'Pediatrics', order: 3, position: 3, duration: 20 },
    { name: 'Orthopedics', order: 4, position: 4, duration: 20 },
    { name: 'Dermatology', order: 5, position: 5, duration: 20 },
  ];
  return Unit.insertMany(units);
};

const createInternWithRotations = async (name, units, startOffsetDays = -100) => {
  const intern = await Intern.create({
    name,
    gender: 'Female',
    batch: 'A',
    phone: '555-1000',
    status: 'active',
    extensionDays: 0,
    totalExtensionDays: 0,
    startDate: addDays(startOfDay(new Date()), startOffsetDays),
    currentUnit: units[0]._id,
  });

  const currentStart = addDays(startOfDay(new Date()), -25);
  const currentEnd = addDays(currentStart, 19);
  const nextStart = addDays(currentEnd, 1);
  const nextEnd = addDays(nextStart, 19);
  const futureStart = addDays(nextEnd, 1);
  const futureEnd = addDays(futureStart, 19);

  const currentRotation = await Rotation.create({
    intern: intern._id,
    unit: units[0]._id,
    status: 'active',
    startDate: currentStart,
    endDate: currentEnd,
    duration: 20,
    baseDuration: 20,
    extensionDays: 0,
  });

  const awaiting = await Rotation.create({
    intern: intern._id,
    unit: units[1]._id,
    status: 'awaiting_confirmation',
    startDate: nextStart,
    endDate: nextEnd,
    duration: 20,
    baseDuration: 20,
    extensionDays: 0,
  });

  const upcoming = await Rotation.create({
    intern: intern._id,
    unit: units[2]._id,
    status: 'upcoming',
    startDate: futureStart,
    endDate: futureEnd,
    duration: 20,
    baseDuration: 20,
    extensionDays: 0,
  });

  return { intern, currentRotation, awaiting, upcoming };
};

const validateState = async (intern) => {
  const rotations = await Rotation.find({ intern: intern._id }).populate('unit').sort({ startDate: 1 }).exec();
  const active = rotations.filter((r) => r.status === 'active');
  const awaiting = rotations.filter((r) => r.status === 'awaiting_confirmation');
  const upcoming = rotations.filter((r) => r.status === 'upcoming');
  const completed = rotations.filter((r) => r.status === 'completed');

  const issues = [];
  if (active.length !== 1) issues.push(`active_count=${active.length}`);
  if (awaiting.length > 1) issues.push(`awaiting_count=${awaiting.length}`);
  if (upcoming.length < 1) issues.push(`upcoming_count=${upcoming.length}`);

  // duplicates by unit
  const unitCounts = {};
  for (const r of rotations) {
    const key = String(r.unit?._id || r.unit);
    unitCounts[key] = (unitCounts[key] || 0) + 1;
    if (unitCounts[key] > 1) issues.push(`duplicate_unit:${r.unit?.name || key}`);
  }

  return { rotations, active, awaiting, upcoming, completed, issues };
};

const writeReport = (path, content) => fs.writeFileSync(path, content, 'utf8');

const run = async () => {
  const mongod = await MongoMemoryServer.create();
  const mongoUri = mongod.getUri();
  await mongoose.connect(mongoUri);

  const app = createApp();
  const units = await createSampleUnits();

  const interns = [];
  for (let i = 0; i < INTERN_COUNT; i++) {
    const created = await createInternWithRotations(`LongRun Intern ${i + 1}`, units);
    interns.push(created);
  }

  // record baseline upcoming counts per intern
  const baselineUpcoming = {};
  for (const record of interns) {
    const ups = await Rotation.find({ intern: record.intern._id, status: 'upcoming' }).exec();
    baselineUpcoming[record.intern._id.toString()] = ups.length;
  }

  console.log(`Starting long-running validation: cycles=${CYCLES}, interns=${INTERN_COUNT}`);

  const anomalies = [];
  const cycleRecords = [];

  for (let cycle = 1; cycle <= CYCLES; cycle++) {
    try {
      // 1. Dashboard refresh (list)
      await request(app).get('/api/interns').expect(200);

      // 2. movement queue refresh (sync of each intern already performed by /api/interns route)
      // 3. predictive planning refresh
      const reshuffleRes = await rotationPlanService.reshuffleAllUpcoming();

      // 4. activity feed refresh
      await request(app).get('/api/activity').expect(200);

      // 5. rebuildInternFutureRotations executed inside reshuffleAllUpcoming
      // 6. overdue calculation & 7. extension updates happen in syncInternRotationStates triggered by routes

      // Occasionally perform reassignment and accept movement for first intern
      if (cycle % REASSIGN_EVERY === 0) {
        const targetIntern = interns[0].intern;
        const existingRotations = await Rotation.find({ intern: targetIntern._id }).exec();
        
        // Get units already used in rotations
        const usedUnitIds = new Set(
          existingRotations
            .map((r) => String(r.unit?._id || r.unit))
            .filter(Boolean)
        );
        
        // Find an available unit not yet assigned to this intern
        const availableUnit = units.find((u) => !usedUnitIds.has(String(u._id)));
        
        if (availableUnit) {
          const reassign = await request(app)
            .post(`/api/rotations/${targetIntern._id}/reassign-next`)
            .send({ newUnitId: availableUnit._id.toString() });
          if (reassign.status !== 200) {
            anomalies.push({ cycle, type: 'reassign_failed', detail: reassign.text });
          } else {
            const accept = await request(app).post(`/api/rotations/${targetIntern._id}/accept-movement`);
            if (accept.status !== 200) anomalies.push({ cycle, type: 'accept_failed', detail: accept.text });
          }
        }
      }

      // Verification per intern
      for (const record of interns) {
        const res = await validateState(record.intern);
        // flag if any basic issues or upcoming count changed from baseline
        const issues = [...res.issues];
        const baseline = baselineUpcoming[record.intern._id.toString()] || 0;
        if (res.upcoming.length !== baseline) issues.push(`upcoming_changed:${res.upcoming.length}!=${baseline}`);
        if (issues.length > 0) {
          anomalies.push({ cycle, intern: record.intern._id.toString(), issues });
        }
      }

      cycleRecords.push({ cycle, reshuffle: reshuffleRes, timestamp: new Date().toISOString() });

    } catch (err) {
      anomalies.push({ cycle, error: String(err) });
    }
  }

  // Final verification and report
  const finalChecks = [];
  for (const record of interns) {
    const res = await validateState(record.intern);
    finalChecks.push({ intern: record.intern._id.toString(), active: res.active.length, awaiting: res.awaiting.length, upcoming: res.upcoming.length, completed: res.completed.length, issues: res.issues });
  }

  const report = [];
  report.push('# LONG_RUNNING_CONFIRMATION_VALIDATION');
  report.push('');
  report.push(`Date: ${new Date().toISOString()}`);
  report.push('');
  report.push(`Cycles executed: ${CYCLES}`);
  report.push(`Intern count: ${INTERN_COUNT}`);
  report.push('');
  report.push('## Summary');
  report.push('');
  if (anomalies.length === 0) report.push('- No anomalies detected');
  else report.push(`- Anomalies detected: ${anomalies.length}`);
  report.push('');
  report.push('## Anomalies (chronological)');

  anomalies.forEach((a, idx) => {
    report.push(`- ${idx + 1}. Cycle ${a.cycle} - ${JSON.stringify(a)}`);
  });

  report.push('');
  report.push('## Final checks per intern');
  finalChecks.forEach((c) => {
    report.push(`- Intern ${c.intern}: active=${c.active}, awaiting=${c.awaiting}, upcoming=${c.upcoming}, completed=${c.completed}, issues=${JSON.stringify(c.issues)}`);
  });

  report.push('');
  report.push('## Cycle records (partial)');
  cycleRecords.slice(-10).forEach((c) => {
    report.push(`- Cycle ${c.cycle} at ${c.timestamp}: rebuiltInternCount=${c.reshuffle?.rebuiltInternCount || 0}`);
  });

  report.push('');
  report.push('## Notes and remaining weak points');
  if (anomalies.length === 0) {
    report.push('- Confirmation workflow appears stable across the executed cycles.');
    report.push('- No duplicate upcoming rotations or disappearance detected in these runs.');
  } else {
    report.push('- Investigate anomalies listed above; further runs recommended with increased cycles.');
  }

  const md = report.join('\n');
  writeReport('./LONG_RUNNING_CONFIRMATION_VALIDATION.md', md);
  console.log('Wrote report to LONG_RUNNING_CONFIRMATION_VALIDATION.md');

  await mongoose.disconnect();
  await mongod.stop();
};

run().catch((err) => {
  console.error('Long-running validation failed:', err);
  process.exit(1);
});
