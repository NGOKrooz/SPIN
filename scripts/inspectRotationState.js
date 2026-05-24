const path = require('path');
const mongoose = require(path.join(__dirname, '..', 'server', 'node_modules', 'mongoose'));
require(path.join(__dirname, '..', 'server', 'node_modules', 'dotenv')).config({ path: path.join(__dirname, '..', 'server', '.env') });

const Rotation = require('../server/models/Rotation');
const Intern = require('../server/models/Intern');

(async () => {
  try {
    const uri = process.env.MONGO_URI;
    if (!uri) throw new Error('MONGO_URI not set');
    await mongoose.connect(uri, { retryWrites: true, w: 'majority' });

    const wf = await Rotation.countDocuments({ workflowState: { $exists: true } });
    const inv = await Rotation.countDocuments({ status: { $nin: ['active', 'upcoming', 'completed'] } });
    const interns = await Intern.find().lean();
    let noActive = 0;
    let multiActive = 0;
    let noUpcoming = 0;
    let multiUpcoming = 0;

    for (const intern of interns) {
      const rots = await Rotation.find({ intern: intern._id }).lean();
      const active = rots.filter(r => String(r.status || '').toLowerCase() === 'active').length;
      const upcoming = rots.filter(r => String(r.status || '').toLowerCase() === 'upcoming').length;
      if (active === 0) noActive++;
      if (active > 1) multiActive++;
      if (upcoming === 0) noUpcoming++;
      if (upcoming > 1) multiUpcoming++;
    }

    console.log('WORKFLOW_STATE', wf);
    console.log('INVALID_STATUS', inv);
    console.log('NO_ACTIVE', noActive);
    console.log('MULTI_ACTIVE', multiActive);
    console.log('NO_UPCOMING', noUpcoming);
    console.log('MULTI_UPCOMING', multiUpcoming);

    await mongoose.disconnect();
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
})();
