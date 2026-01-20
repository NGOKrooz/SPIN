# Prisma Setup for SPIN

This directory contains the Prisma schema, migrations, and seed scripts for the SPIN application.

## Prerequisites

- Node.js installed
- PostgreSQL database (Supabase) with `DATABASE_URL` environment variable set
- Prisma CLI installed globally or via npm scripts

## Setup

### 1. Install Dependencies

```bash
npm install
```

### 2. Configure Database

Ensure your `DATABASE_URL` environment variable is set in your `.env` file:

```env
DATABASE_URL="postgresql://user:password@host:port/database?sslmode=require"
```

For Supabase, the connection string typically looks like:
```
postgresql://postgres:[YOUR-PASSWORD]@db.[YOUR-PROJECT-REF].supabase.co:5432/postgres
```

### 3. Generate Prisma Client

```bash
npm run prisma:generate
```

Or:
```bash
npx prisma generate
```

### 4. Run Migrations

For production (deployed environments):
```bash
npm run prisma:migrate
```

For development:
```bash
npm run prisma:migrate:dev
```

This will:
- Apply all pending migrations to your database
- Create all tables, enums, indexes, and foreign keys
- Mark migrations as applied

### 5. Seed the Database

```bash
npm run prisma:seed
```

This will:
- Insert default settings
- Insert default units (12 units with 2-day durations)
- Optionally generate rotations for existing interns without rotations

## Database Schema

### Models

- **Intern**: Represents an intern with batch, status, and extension information
- **Unit**: Represents a rotation unit with duration and workload
- **Rotation**: Represents a rotation assignment linking intern to unit with date range
- **ExtensionReason**: Tracks extension reasons for interns
- **Setting**: Application settings (key-value pairs)
- **WorkloadHistory**: Historical workload data for units
- **ActivityLog**: Activity log for tracking changes

### Enums

- `Gender`: Male, Female
- `Batch`: A, B
- `InternStatus`: Active, Extended, Completed
- `Workload`: Low, Medium, High
- `ExtensionReasonType`: sign_out, presentation, internal_query, leave, other
- `ActivityType`: extension, reassignment, unit_change, status_change, new_intern, auto_advance, rotation_update

## Usage in Code

### Import Prisma Client

```javascript
const prisma = require('../database/prisma');
```

### Example: Create an Intern

```javascript
const intern = await prisma.intern.create({
  data: {
    name: 'John Doe',
    gender: 'Male',
    batch: 'A',
    startDate: new Date('2024-01-01'),
    phoneNumber: '+1234567890',
    status: 'Active',
    extensionDays: 0,
  },
});
```

### Example: Query with Relations

```javascript
const intern = await prisma.intern.findUnique({
  where: { id: 1 },
  include: {
    rotations: {
      include: {
        unit: true,
      },
    },
  },
});
```

### Example: Use Service Functions

```javascript
const internService = require('../services/internService');

// Create intern with auto-generated rotations
const intern = await internService.createIntern({
  name: 'Jane Doe',
  gender: 'Female',
  batch: 'B',
  startDate: new Date('2024-01-01'),
}, {
  autoGenerateRotations: true,
});
```

## Migrations

Migrations are stored in `prisma/migrations/`. Each migration contains SQL to modify the database schema.

### Creating a New Migration

```bash
npx prisma migrate dev --name migration_name
```

This will:
1. Create a new migration file
2. Apply it to your database
3. Regenerate Prisma Client

### Applying Migrations in Production

```bash
npx prisma migrate deploy
```

This applies all pending migrations without prompting.

## Prisma Studio

View and edit your database using Prisma Studio:

```bash
npm run prisma:studio
```

This opens a web interface at `http://localhost:5555` where you can browse and edit data.

## Timezone Safety

All date operations use `date-fns` functions which work with JavaScript Date objects. Dates are stored as `DATE` or `TIMESTAMP` in PostgreSQL, which are timezone-agnostic. Always use UTC for calculations and convert to local time only for display.

## Troubleshooting

### Migration Errors

If migrations fail:
1. Check your `DATABASE_URL` is correct
2. Ensure you have proper database permissions
3. Check if tables already exist (you may need to reset: `npx prisma migrate reset`)

### Connection Issues

- Verify `DATABASE_URL` format
- Check firewall/network settings
- Ensure SSL mode is correct for Supabase (`?sslmode=require`)

### Schema Changes

After modifying `schema.prisma`:
1. Run `npx prisma generate` to update the client
2. Create a migration: `npx prisma migrate dev --name description`
3. Apply migration: `npx prisma migrate deploy` (production)

## Service Files

Example service files are provided in `server/services/`:
- `internService.js`: Intern CRUD and rotation generation
- `rotationService.js`: Rotation queries and auto-advancement
- `unitService.js`: Unit management

These can be used as reference when updating existing routes to use Prisma.
