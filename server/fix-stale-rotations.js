const { getDatabase } = require('./database/init');
const { format, addDays, parseISO } = require('date-fns');

const db = getDatabase();

async function fixStaleRotations() {
  console.log('\n🔧 Fixing stale rotations...\n');
  
  try {
    // Step 1: Get all interns
    const interns = await new Promise((resolve, reject) => {
      db.all('SELECT * FROM interns WHERE status IN ("Active", "Extended")', [], (err, rows) => {
        if (err) reject(err);
        else resolve(rows || []);
      });
    });
    
    console.log(`Found ${interns.length} active intern(s)\n`);
    
    for (const intern of interns) {
      console.log(`\n📋 Processing: ${intern.name} (ID: ${intern.id})`);
      console.log(`   Start date: ${intern.start_date}`);
      
      // Step 2: Get all rotations for this intern
      const rotations = await new Promise((resolve, reject) => {
        db.all('SELECT * FROM rotations WHERE intern_id = ? ORDER BY start_date', [intern.id], (err, rows) => {
          if (err) reject(err);
          else resolve(rows || []);
        });
      });
      
      console.log(`   Found ${rotations.length} rotation(s)`);
      
      if (rotations.length === 0) {
        console.log(`   ⚠️  No rotations found - skipping`);
        continue;
      }
      
      // Step 3: Check if rotations are dated before intern's start date
      const internStart = parseISO(intern.start_date);
      const firstRotation = rotations[0];
      const firstRotationStart = parseISO(firstRotation.start_date);
      
      if (firstRotationStart < internStart) {
        console.log(`   ❌ Stale rotations detected! First rotation (${firstRotation.start_date}) is before intern start (${intern.start_date})`);
        console.log(`   🗑️  Deleting ${rotations.length} stale rotation(s)...`);
        
        // Delete all rotations for this intern
        await new Promise((resolve, reject) => {
          db.run('DELETE FROM rotations WHERE intern_id = ?', [intern.id], function(err) {
            if (err) reject(err);
            else {
              console.log(`   ✅ Deleted ${this.changes} rotation(s)`);
              resolve();
            }
          });
        });
      } else {
        console.log(`   ✅ Rotations look good - first rotation starts on ${firstRotation.start_date}`);
      }
    }
    
    console.log('\n\n✅ Stale rotations fixed!');
    console.log('\n📝 Next steps:');
    console.log('   1. Restart your Railway deployment');
    console.log('   2. Open the intern dashboard');
    console.log('   3. Click "Refresh Rotations" button');
    console.log('   4. Upcoming rotations should appear!\n');
    
    process.exit(0);
  } catch (err) {
    console.error('\n❌ Error:', err);
    process.exit(1);
  }
}

fixStaleRotations();

