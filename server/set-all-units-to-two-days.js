require('dotenv').config();
const db = require('./database/dbWrapper');

console.log('🎲 Setting all unit durations to 2 days...\n');

async function setTwoDayDurations() {
  try {
    const units = await new Promise((resolve, reject) => {
      db.all('SELECT id, name, duration_days FROM units ORDER BY id', [], (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });
    
    console.log(`   Found ${units.length} unit(s):\n`);
    
    for (const unit of units) {
      await new Promise((resolve, reject) => {
        db.run(
          'UPDATE units SET duration_days = ? WHERE id = ?',
          [2, unit.id], // Set to 2 days
          function(err) {
            if (err) reject(err);
            else {
              console.log(`   ✅ ${unit.name}: 2 days`);
              resolve();
            }
          }
        );
      });
    }
    console.log('\n✅ All units updated to 2 days duration!\n');
  } catch (err) {
    console.error('❌ Error updating units:', err);
    throw err;
  }
}

setTwoDayDurations().then(() => {
  console.log('Done!');
  process.exit(0);
}).catch(err => {
  console.error('Failed:', err);
  process.exit(1);
});

