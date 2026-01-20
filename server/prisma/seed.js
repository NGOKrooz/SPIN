const { PrismaClient } = require('@prisma/client');
const { addDays, format, parseISO } = require('date-fns');

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Starting database seed...');

  // Seed default settings
  console.log('📝 Seeding default settings...');
  const defaultSettings = [
    { key: 'batch_a_off_day_week1', value: 'Monday', description: 'Day of the week when Batch A is off in weeks 1&2' },
    { key: 'batch_b_off_day_week1', value: 'Wednesday', description: 'Day of the week when Batch B is off in weeks 1&2' },
    { key: 'batch_a_off_day_week3', value: 'Wednesday', description: 'Day of the week when Batch A is off in weeks 3&4' },
    { key: 'batch_b_off_day_week3', value: 'Monday', description: 'Day of the week when Batch B is off in weeks 3&4' },
    { key: 'schedule_start_date', value: '2024-01-01', description: 'Reference date for calculating alternating schedule weeks' },
    { key: 'internship_duration_months', value: '12', description: 'Total internship duration in months' },
    { key: 'rotation_buffer_days', value: '2', description: 'Buffer days between rotations' },
    { key: 'auto_generation', value: JSON.stringify({ auto_generate_on_create: false }), description: 'Auto-generation settings' }
  ];

  for (const setting of defaultSettings) {
    await prisma.setting.upsert({
      where: { key: setting.key },
      update: {},
      create: setting,
    });
  }
  console.log(`✅ Seeded ${defaultSettings.length} settings`);

  // Seed default units
  console.log('🏥 Seeding default units...');
  const defaultUnits = [
    { name: 'Adult Neurology', durationDays: 2, patientCount: 0 },
    { name: 'Acute Stroke', durationDays: 2, patientCount: 0 },
    { name: 'Neurosurgery', durationDays: 2, patientCount: 0 },
    { name: 'Geriatrics', durationDays: 2, patientCount: 0 },
    { name: 'Orthopedic Inpatients', durationDays: 2, patientCount: 0 },
    { name: 'Orthopedic Outpatients', durationDays: 2, patientCount: 0 },
    { name: 'Electrophysiology', durationDays: 2, patientCount: 0 },
    { name: 'Exercise Immunology', durationDays: 2, patientCount: 0 },
    { name: 'Women\'s Health', durationDays: 2, patientCount: 0 },
    { name: 'Pediatrics Inpatients', durationDays: 2, patientCount: 0 },
    { name: 'Pediatrics Outpatients', durationDays: 2, patientCount: 0 },
    { name: 'Cardio Thoracic Unit', durationDays: 2, patientCount: 0 }
  ];

  for (const unit of defaultUnits) {
    // Calculate workload from patient_count
    let workload = 'Medium';
    if (unit.patientCount <= 4) workload = 'Low';
    else if (unit.patientCount <= 8) workload = 'Medium';
    else workload = 'High';

    await prisma.unit.upsert({
      where: { name: unit.name },
      update: {},
      create: {
        name: unit.name,
        durationDays: unit.durationDays,
        patientCount: unit.patientCount,
        workload: workload,
      },
    });
  }
  console.log(`✅ Seeded ${defaultUnits.length} units`);

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


