require('dotenv').config();
const db = require('./database/dbWrapper');
const { addDays, parseISO, format } = require('date-fns');

console.log('🔧 Fixing rotation end dates based on unit durations...\n');

async function fixRotationEndDates() {
  try {
    // Get all rotations with their unit durations
    const rotations = await new Promise((resolve, reject) => {
      db.all(`
        SELECT 
          r.id,
          r.start_date,
          r.end_date,
          r.unit_id,
          u.duration_days,
          u.name as unit_name
        FROM rotations r
        JOIN units u ON r.unit_id = u.id
        ORDER BY r.id
      `, [], (err, rows) => {
        if (err) reject(err);
        else resolve(rows || []);
      });
    });

    if (rotations.length === 0) {
      console.log('   No rotations found. Nothing to fix.\n');
      process.exit(0);
      return;
    }

    console.log(`   Found ${rotations.length} rotation(s) to check:\n`);

    let fixed = 0;
    let skipped = 0;

    for (const rotation of rotations) {
      // Calculate correct end date: start_date + (duration_days - 1)
      const startDate = parseISO(rotation.start_date);
      const correctEndDate = addDays(startDate, rotation.duration_days - 1);
      const correctEndDateStr = format(correctEndDate, 'yyyy-MM-dd');

      // Check if end date needs fixing
      if (rotation.end_date !== correctEndDateStr) {
        await new Promise((resolve, reject) => {
          db.run(
            'UPDATE rotations SET end_date = ? WHERE id = ?',
            [correctEndDateStr, rotation.id],
            function(err) {
              if (err) {
                console.error(`   ❌ Error updating rotation ${rotation.id}:`, err);
                reject(err);
              } else {
                console.log(`   ✅ Fixed: ${rotation.unit_name} - ${rotation.start_date} to ${correctEndDateStr} (was ${rotation.end_date})`);
                fixed++;
                resolve();
              }
            }
          );
        });
      } else {
        skipped++;
        console.log(`   ✓ Correct: ${rotation.unit_name} - ${rotation.start_date} to ${rotation.end_date}`);
      }
    }

    console.log(`\n✅ Fixed ${fixed} rotation(s), ${skipped} already correct\n`);
    process.exit(0);
  } catch (err) {
    console.error('❌ Error fixing rotations:', err);
    process.exit(1);
  }
}

fixRotationEndDates();


