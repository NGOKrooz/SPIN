const { PrismaClient } = require('@prisma/client');
const { addDays, format, parseISO } = require('date-fns');

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Starting database seed...');

  // Seed default settings
  console.log('📝 Seeding default settings...');
  const defaultSettings = [
    { key: 'system_name', value: 'SPIN', description: 'Display name for the system' },
    { key: 'default_rotation_duration_days', value: '', description: 'Optional default rotation duration in days' },
    { key: 'auto_rotation_enabled', value: 'true', description: 'Enable or disable automatic rotation advancement' }
  ];

  for (const setting of defaultSettings) {
    await prisma.setting.upsert({
      where: { key: setting.key },
      update: {},
      create: setting,
    });
  }
  console.log(`✅ Seeded ${defaultSettings.length} settings`);

  // Optional: Generate rotations for existing interns if they don't have any
  const internsWithoutRotations = await prisma.intern.findMany({
    where: {
      status: { in: ['Active', 'Extended'] },
      rotations: { none: {} }
    },
    include: {
      rotations: true
    }
  });

  if (internsWithoutRotations.length > 0) {
    console.log(`🔄 Found ${internsWithoutRotations.length} intern(s) without rotations. Generating rotations...`);
    
    const units = await prisma.unit.findMany({
      orderBy: { id: 'asc' }
    });

    if (units.length > 0) {
      for (let i = 0; i < internsWithoutRotations.length; i++) {
        const intern = internsWithoutRotations[i];
        await generateRotationsForIntern(prisma, intern, units, i);
      }
      console.log(`✅ Generated rotations for ${internsWithoutRotations.length} intern(s)`);
    } else {
      console.log('⚠️  No units available, skipping rotation generation');
    }
  }

  console.log('✨ Seed completed successfully!');
}

async function generateRotationsForIntern(prisma, intern, units, internIndex) {
  const rotations = [];
  const startDate = typeof intern.startDate === 'string' ? parseISO(intern.startDate) : intern.startDate;
  let currentDate = startDate;

  // Round-robin: start at different offset for each intern
  const startUnitIndex = internIndex % units.length;
  const orderedUnits = [
    ...units.slice(startUnitIndex),
    ...units.slice(0, startUnitIndex)
  ];

  // Base cycle: rotate through every unit exactly once
  for (const unit of orderedUnits) {
    const rotationStart = currentDate;
    const rotationEnd = addDays(rotationStart, unit.durationDays - 1);

    rotations.push({
      internId: intern.id,
      unitId: unit.id,
      startDate: rotationStart,
      endDate: rotationEnd,
      isManualAssignment: false,
    });

    currentDate = addDays(rotationEnd, 1);
  }

  // Extension handling – distribute extra days across additional rotations
  let remainingExtension = 0;
  if (intern.status === 'Extended') {
    const ext = parseInt(intern.extensionDays, 10);
    if (!Number.isNaN(ext) && ext > 0) {
      remainingExtension = ext;
    }
  }

  while (remainingExtension > 0) {
    for (const unit of orderedUnits) {
      if (remainingExtension <= 0) break;

      const durationDays = Math.min(unit.durationDays, remainingExtension);
      const rotationStart = currentDate;
      const rotationEnd = addDays(rotationStart, durationDays - 1);

      rotations.push({
        internId: intern.id,
        unitId: unit.id,
        startDate: rotationStart,
        endDate: rotationEnd,
        isManualAssignment: false,
      });

      currentDate = addDays(rotationEnd, 1);
      remainingExtension -= durationDays;
    }
  }

  // Insert rotations
  if (rotations.length > 0) {
    await prisma.rotation.createMany({
      data: rotations,
    });
  }
}

main()
  .catch((e) => {
    console.error('❌ Error seeding database:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });


