const express = require('express');
const request = require('supertest');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const internsRouter = require('./server/routes/interns');
const rotationsRouter = require('./server/routes/rotations');
const activityRouter = require('./server/routes/activity');
const debugRouter = require('./server/routes/debug');
const Intern = require('./server/models/Intern');
const Rotation = require('./server/models/Rotation');
const Unit = require('./server/models/Unit');

(async () => {
  const mongoServer = await MongoMemoryServer.create();
  await mongoose.connect(mongoServer.getUri(), { dbName: 'debug' });
  const app = express(); app.use(express.json());
  app.use('/api/interns', internsRouter);
  app.use('/api/rotations', rotationsRouter);
  app.use('/api/activity', activityRouter);
  app.use('/api/debug', debugRouter);

  const today = new Date(); today.setHours(0,0,0,0);
  const addDays = (d,n)=>{ const v=new Date(d); v.setDate(v.getDate()+Number(n)); return v; };
  const units = await Unit.create([
    { name: 'Cardiology', order: 1, duration: 20, capacity: 4 },
    { name: 'Neurology', order: 2, duration: 20, capacity: 4 },
    { name: 'Pediatrics', order: 3, duration: 20, capacity: 4 },
    { name: 'Orthopedics', order: 4, duration: 20, capacity: 4 },
  ]);
  const intern = await Intern.create({ name:'Phase4 Upcoming Persistence Intern', gender:'Female', batch:'A', startDate:addDays(today,-100), status:'active' });
  const activeStart = addDays(today,-25);
  const activeEnd = addDays(activeStart,19);
  const nextAwaitingStart = addDays(today,1);
  const nextAwaitingEnd = addDays(nextAwaitingStart,19);
  const futureUpcomingStart = addDays(nextAwaitingEnd,1);
  const futureUpcomingEnd = addDays(futureUpcomingStart,19);
  await Rotation.create({ intern: intern._id, unit: units[0]._id, startDate: activeStart, endDate: activeEnd, duration:20, status:'active' });
  await Rotation.create({ intern: intern._id, unit: units[1]._id, startDate: nextAwaitingStart, endDate: nextAwaitingEnd, duration:20, status:'awaiting_confirmation' });
  await Rotation.create({ intern: intern._id, unit: units[2]._id, startDate: futureUpcomingStart, endDate: futureUpcomingEnd, duration:20, status:'upcoming' });
  const resp = await request(app).get(`/api/interns/${intern._id}`);
  console.log('status', resp.status);
  console.log('body', JSON.stringify(resp.body, null, 2));
  const all = await Rotation.find({ intern: intern._id }).sort({ startDate:1 }).lean();
  console.log('db', all.map(r => ({id:r._id.toString().slice(-4),unit:r.unit.toString().slice(-4),status:r.status,startDate:r.startDate?new Date(r.startDate).toISOString():null,endDate:r.endDate?new Date(r.endDate).toISOString():null,workflowState:r.workflowState})));
  const upcoming = await Rotation.find({ intern: intern._id, status:'upcoming' }).lean();
  console.log('upcoming count', upcoming.length, upcoming.map(r=>({unit:r.unit.toString().slice(-4),startDate:r.startDate?new Date(r.startDate).toISOString():null, endDate:r.endDate?new Date(r.endDate).toISOString():null,status:r.status})));
  const awaiting = await Rotation.find({ intern: intern._id, status:'awaiting_confirmation' }).lean();
  console.log('awaiting count', awaiting.length, awaiting.map(r=>({unit:r.unit.toString().slice(-4),startDate:r.startDate?new Date(r.startDate).toISOString():null, endDate:r.endDate?new Date(r.endDate).toISOString():null,status:r.status})));
  await mongoose.disconnect();
  await mongoServer.stop();
})();
