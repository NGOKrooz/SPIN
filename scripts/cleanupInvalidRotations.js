const path = require('path');
const serverModules = path.join(process.cwd(), 'server', 'node_modules');
module.paths.unshift(serverModules);
const mongoose = require('mongoose');
require('dotenv').config({ path: path.join(process.cwd(), 'server', '.env') });
const Rotation = require('../server/models/Rotation');
(async () => {
  await mongoose.connect(process.env.MONGO_URI, { retryWrites: true, w: 'majority' });
  const filter = {
    $or: [
      { status: { $exists: false } },
      { status: { $nin: ['active', 'upcoming', 'completed'] } },
      { intern: { $exists: false } },
      { unit: { $exists: false } },
      { intern: null },
      { unit: null },
    ],
  };
  const count = await Rotation.countDocuments(filter);
  console.log('Invalid rotation candidates count:', count);
  if (count === 0) {
    console.log('Nothing to remove.');
    await mongoose.disconnect();
    process.exit(0);
  }

  const removed = await Rotation.deleteMany(filter);
  console.log('Removed invalid rotations:', removed.deletedCount);
  await mongoose.disconnect();
  process.exit(0);
})();
