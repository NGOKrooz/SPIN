require('dotenv').config();
const db = require('./database/dbWrapper');

console.log('🔧 Setting all unit durations to 1 day...\n');

async function setAllUnitsToOneDay() {
  try {
    // Get all units
    const units = await new Promise((resolve, reject) => {
      db.all('SELECT id, name, duration_days FROM units ORDER BY id', [], (err, rows) => {
        if (err) reject(err);
        else resolve(rows || []);
      });
    });
    
    if (units.length === 0) {
      console.log('   No units found. Skipping update.\n');
      process.exit(0);
      return;
    }
    
    console.log(`   Found ${units.length} unit(s):\n`);
    
    // Update each unit to 1 day
    for (const unit of units) {
      await new Promise((resolve, reject) => {
        db.run(
          'UPDATE units SET duration_days = ? WHERE id = ?',
          [1, unit.id],
          function(err) {
            if (err) {
              console.error(`   ❌ Error updating ${unit.name}:`, err);
              reject(err);
            } else {
              console.log(`   ✅ ${unit.name}: 1 day (was ${unit.duration_days} days)`);
              resolve();
            }
          }
        );
      });
    }
    
    console.log('\n✅ All units updated to 1 day duration!\n');
    process.exit(0);
  } catch (err) {
    console.error('❌ Error updating units:', err);
    process.exit(1);
  }
}

setAllUnitsToOneDay();

