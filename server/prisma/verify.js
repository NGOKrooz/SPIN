/**
 * Verification script to test Prisma setup
 * Run with: node prisma/verify.js
 */

const prisma = require('../database/prisma');

async function verify() {
  console.log('🔍 Verifying Prisma setup...\n');

  try {
    // Test connection
    console.log('1. Testing database connection...');
    await prisma.$connect();
    console.log('   ✅ Database connection successful\n');

    // Check if tables exist
    console.log('2. Checking tables...');
    const internCount = await prisma.intern.count();
    const unitCount = await prisma.unit.count();
    const rotationCount = await prisma.rotation.count();
    const settingCount = await prisma.setting.count();

    console.log(`   ✅ Interns table: ${internCount} records`);
    console.log(`   ✅ Units table: ${unitCount} records`);
    console.log(`   ✅ Rotations table: ${rotationCount} records`);
    console.log(`   ✅ Settings table: ${settingCount} records\n`);

    // Test enum values
    console.log('3. Testing enum values...');
    const testIntern = await prisma.intern.findFirst();
    if (testIntern) {
      console.log(`   ✅ Gender enum: ${testIntern.gender}`);
      console.log(`   ✅ Batch enum: ${testIntern.batch}`);
      console.log(`   ✅ Status enum: ${testIntern.status}\n`);
    } else {
      console.log('   ⚠️  No interns found to test enums\n');
    }

    // Test relations
    console.log('4. Testing relations...');
    const internWithRotations = await prisma.intern.findFirst({
      include: {
        rotations: {
          include: {
            unit: true,
          },
        },
      },
    });

    if (internWithRotations) {
      console.log(`   ✅ Intern-Rotation relation: ${internWithRotations.rotations.length} rotations`);
      if (internWithRotations.rotations.length > 0) {
        console.log(`   ✅ Rotation-Unit relation: ${internWithRotations.rotations[0].unit.name}\n`);
      }
    } else {
      console.log('   ⚠️  No interns with rotations found\n');
    }

    // Test queries
    console.log('5. Testing queries...');
    const units = await prisma.unit.findMany({
      take: 5,
    });
    console.log(`   ✅ Query test: Found ${units.length} units\n`);

    console.log('✨ All verification tests passed!');
    console.log('\n📝 Next steps:');
    console.log('   - Run seed script: npm run prisma:seed');
    console.log('   - Start using Prisma in your routes');
    console.log('   - Check Prisma Studio: npm run prisma:studio');

  } catch (error) {
    console.error('❌ Verification failed:', error.message);
    console.error('\nError details:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

verify();

