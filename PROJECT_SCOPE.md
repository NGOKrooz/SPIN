# SPIN - Project Scope Document

**Version:** 1.0  
**Last Updated:** March 4, 2026  
**System:** Physiotherapy Internship Scheduler for UNTH Ituku Ozalla

---

## Table of Contents

1. [Product Overview](#product-overview)
2. [Active User Workflows](#active-user-workflows)
3. [API Surface](#api-surface)
4. [Data Model](#data-model)
5. [Architecture & Tech Stack](#architecture--tech-stack)
6. [Deployment & Operations](#deployment--operations)
7. [Testing & Validation](#testing--validation)
8. [Not in Active Scope](#not-in-active-scope)

---

## Product Overview

### Purpose
SPIN (Scheduled Physiotherapy Internship Navigator) is a hospital internship scheduling system designed specifically for the Physiotherapy Department at the University of Nigeria Teaching Hospital (UNTH), Ituku Ozalla. The system manages the complete lifecycle of physiotherapy intern rotations across multiple clinical units.

### Core Problems Solved
- **Rotation Management:** Automates the scheduling and tracking of intern assignments across hospital units
- **Workload Balance:** Distributes interns equitably across units based on capacity and current patient load
- **Coverage Continuity:** Ensures all units maintain adequate intern coverage during rotations
- **Activity Tracking:** Creates an auditable log of all system changes for administrative oversight
- **Extension Handling:** Manages intern deadline extensions while maintaining schedule integrity

### Target Users
- **Administrators:** Department heads and coordinators who manage intern assignments, unit configurations, and system settings
- **Guests:** Read-only users (interns, supervisors) who can view schedules and unit assignments without making changes

### Key Constraints
- **Unit Rotation Requirement:** Every intern must complete rotations through all configured units
- **Duration Standard:** Default rotation period is 4 weeks (configurable via settings)
- **Coverage Minimum:** Units should not be left without interns during active rotation periods
- **Batch Management:** System handles multiple cohorts/batches of interns simultaneously

---

## Active User Workflows

### 1. Dashboard (`/`)
**Purpose:** High-level overview of system status and recent activity

**Active Capabilities:**
- View current rotation statistics (active interns, total units, current rotation period)
- Monitor recent system updates feed (last 10 activities)
- Quick access to intern and unit summaries
- Visual indicators for coverage status and workload distribution

**User Actions:**
- Navigate to detailed management pages
- Review at-a-glance system health
- Monitor recent administrative changes

**Data Sources:**
- Current rotation count from rotations table
- Active intern count from interns table
- Unit statistics from units table
- Recent updates from activity_logs table

---

### 2. Interns Management (`/interns`)
**Purpose:** Comprehensive intern lifecycle management

**Active Capabilities:**

#### 2.1 Intern List View
- Display all interns with current status (Active, Completed, Extended)
- Show current unit assignment and rotation progress
- Filter by status, batch, unit assignment
- Search by name or registration number
- Export/print intern roster

#### 2.2 Intern Creation
- Add new intern with required fields:
  - Full name
  - Registration number (unique identifier)
  - Batch/cohort designation
  - Start date
  - Expected end date (calculated from start + standard duration)
- Automatic initial unit assignment based on workload balance
- Activity log entry created on successful addition

#### 2.3 Intern Details Modal
- View complete intern profile
- See full rotation history (all units completed)
- Review current assignment details
- Check extension history if applicable
- Activity timeline for this specific intern

#### 2.4 Intern Updates
- Modify intern personal details (name, registration number)
- Adjust batch assignment
- Update status (Active, Completed, Extended)
- Edit start/end dates with validation

#### 2.5 Intern Deletion
- Remove intern from system
- Cascade cleanup: removes associated rotations and activity logs
- Confirmation dialog prevents accidental deletion
- Activity log created recording deletion event

#### 2.6 Extension Management
- Extend intern deadline beyond original completion date
- Specify extension duration (weeks)
- Add justification/reason for extension
- Automatic recalculation of rotation schedule
- Status updated to "Extended"
- Activity log entry created

#### 2.7 Intern Schedule View
- Display complete rotation timeline for selected intern
- Show past rotations (unit, start date, end date, status)
- Display upcoming rotations
- View current assignment with remaining time
- Visual timeline representation

**User Roles:**
- **Admin:** Full CRUD access, can extend, delete, reassign
- **Guest:** Read-only view of all interns and schedules

**API Endpoints Used:**
- `GET /api/interns` - List all interns with filters
- `GET /api/interns/:id` - Get single intern details
- `POST /api/interns` - Create new intern
- `PUT /api/interns/:id` - Update intern
- `DELETE /api/interns/:id` - Delete intern
- `POST /api/interns/:id/extend` - Extend internship
- `GET /api/interns/:id/schedule` - Get rotation schedule

---

### 3. Units Management (`/units`)
**Purpose:** Configure and monitor clinical unit settings and assignments

**Active Capabilities:**

#### 3.1 Unit List View
- Display all configured hospital units
- Show current intern assignments per unit
- Display workload metrics (current patient count, capacity, coverage level)
- Visual indicators for units at/over capacity
- Search and filter by unit name or coverage status
- Reorder units (affects rotation sequence)

#### 3.2 Unit Creation
- Add new clinical unit with:
  - Unit name
  - Capacity (maximum interns)
  - Initial patient count
  - Active status
  - Display order (for rotation sequence)
- Automatic integration into rotation generation algorithm
- Activity log entry created

#### 3.3 Unit View Modal
- View detailed unit profile
- See all currently assigned interns
- Review historical intern completions
- Check workload history (patient count over time)
- View coverage trends

#### 3.4 Unit Updates
- Edit unit name
- Adjust capacity limits
- Update patient count (real-time workload tracking)
- Toggle active/inactive status
- Modify display order

#### 3.5 Unit Deletion
- Remove unit from system
- Pre-deletion validation: ensures no active intern assignments
- Cascade cleanup: removes associated rotations and history
- Confirmation dialog with safety checks
- Activity log entry created

#### 3.6 Workload Management
- Update current patient count
- View workload history chart (last 12 entries by default)
- Track coverage level (interns vs. patient load)
- Automatic workload balancing recommendations

#### 3.7 Unit Reordering
- Drag-and-drop interface to change unit sequence
- Affects rotation assignment order
- Persisted to database immediately
- Used by rotation generation algorithm

**User Roles:**
- **Admin:** Full CRUD access, workload updates, reordering
- **Guest:** Read-only view of units and assignments

**API Endpoints Used:**
- `GET /api/units` - List all units
- `GET /api/units/:id` - Get single unit details
- `POST /api/units` - Create unit
- `PUT /api/units/:id` - Update unit
- `DELETE /api/units/:id` - Delete unit
- `POST /api/units/:id/workload` - Update workload
- `POST /api/units/:id/patient-count` - Update patient count
- `GET /api/units/:id/workload-history` - Get workload timeline
- `GET /api/units/:id/completed-interns` - Get completion history
- `PUT /api/units/reorder` - Update display order

---

### 4. Manual Assignment (`/manual-assignment`)
**Purpose:** Administrative override for intern-unit assignments

**Active Capabilities:**

#### 4.1 Manual Reassignment
- View all active interns with current assignments
- Select intern for reassignment
- Choose target unit from available units
- Specify effective date for reassignment
- Add justification/reason for override
- Preview impact on unit coverage before confirming

#### 4.2 Reassignment Validation
- Check target unit capacity constraints
- Warn if reassignment creates coverage gaps
- Validate against rotation rules (no duplicate assignments)
- Confirm intern is not already assigned to target unit

#### 4.3 Reassignment Execution
- Create new rotation record with manual assignment flag
- Update intern's current_unit field
- End previous rotation early if mid-rotation reassignment
- Create activity log entry with admin action details
- Notify success with updated assignment confirmation

**User Roles:**
- **Admin:** Full access to manual reassignment
- **Guest:** No access (route visible but actions disabled)

**API Endpoints Used:**
- `GET /api/interns` - List interns for selection
- `GET /api/units` - List target units
- `POST /api/rotations` - Create manual assignment rotation
- `PUT /api/rotations/:id` - Update affected rotations

---

### 5. Settings (`/settings`)
**Purpose:** System configuration and user session management

**Active Capabilities:**

#### 5.1 System Settings (Read/Write)
- **Rotation Duration (Weeks):** Configure default rotation period (1-52 weeks, default: 4)
- **Allow Manual Reassignment:** Toggle permission for admin overrides
- **Auto Log Activity:** Enable/disable automatic activity logging

#### 5.2 Settings Persistence
- Save settings to backend database
- Real-time validation on input
- Confirmation toast on successful save
- Error handling for failed updates

#### 5.3 Account Management
- Display current role (Admin or Guest)
- Sign out functionality (clears local session)
- Role switch option (returns to login screen)

**User Roles:**
- **Admin:** Can view and modify system settings
- **Guest:** Can view settings (read-only, save button disabled)

**API Endpoints Used:**
- `GET /api/settings/system` - Retrieve current settings
- `PUT /api/settings/system` - Update settings (admin only)

---

### 6. Authentication & Authorization

**Active Capabilities:**

#### 6.1 Role Selection (Initial Screen)
- Presented when no role is stored locally
- Two options:
  1. **Sign in as Admin:** Prompts for admin password
  2. **View as Guest:** Immediate read-only access

#### 6.2 Admin Authentication
- Password verification via `/api/auth/verify-admin`
- Password stored in `localStorage` as `adminKey`
- Attached to all write-operation requests via `x-admin-key` header
- Failed authentication shows error dialog

#### 6.3 Session Management
- Role persisted in `localStorage` as `role` (admin or guest)
- Admin key attached to POST/PUT/DELETE requests automatically
- Sign out clears both `role` and `adminKey` from localStorage
- Session persists across page refreshes

#### 6.4 Backend Authorization
- All write endpoints (POST/PUT/DELETE) protected by admin key verification
- Missing or invalid key returns 401 Unauthorized
- Read endpoints (GET) accessible without authentication
- Health check endpoint always public

**Security Model:**
- Single shared admin password (configured via `ADMIN_PASSWORD` env var)
- No user database or individual accounts
- No JWT/token system (uses simple key verification)
- CORS restricted to specific frontend origin (`https://spin-interns.vercel.app`)

---

## API Surface

### Base URL
- **Production:** `https://spin-j3qw.onrender.com/api`
- **Development:** `/api` (proxied to localhost:5000)

### Global Headers
- `Content-Type: application/json`
- `x-admin-key: <password>` (required for write operations when authenticated as admin)

### Active Endpoints

#### Health & Configuration
```
GET /api/health
  Response: { status: "OK", message: "SPIN API is running", timestamp: ISO-string }

GET /api/config
  Response: System configuration (CORS origins, environment)

GET /api/debug
  Response: Database connection diagnostics (development only)
```

#### Authentication
```
GET /api/auth/verify-admin
  Headers: x-admin-key (required)
  Response: { ok: true } | 401 Unauthorized
```

#### Interns
```
GET /api/interns
  Query params: status, batch, unit, search
  Response: Array of intern objects with current assignments

GET /api/interns/:id
  Response: Single intern with full details

POST /api/interns
  Body: { name, registration_number, batch, start_date, end_date }
  Response: Created intern object
  Auth: Admin required

PUT /api/interns/:id
  Body: Partial intern fields to update
  Response: Updated intern object
  Auth: Admin required

DELETE /api/interns/:id
  Response: { message: "Intern deleted", deletedCount }
  Auth: Admin required

POST /api/interns/:id/extend
  Body: { weeks, reason }
  Response: Updated intern with new end_date
  Auth: Admin required

GET /api/interns/:id/schedule
  Response: Array of rotations (past, current, upcoming)

GET /api/interns/activities/recent
  Query params: limit (default 20)
  Response: Recent activities related to interns
```

#### Units
```
GET /api/units
  Query params: active (boolean filter)
  Response: Array of units with current assignments

GET /api/units/:id
  Response: Single unit with detailed assignments

POST /api/units
  Body: { name, capacity, patient_count, display_order, active }
  Response: Created unit object
  Auth: Admin required

PUT /api/units/:id
  Body: Partial unit fields to update
  Response: Updated unit object
  Auth: Admin required

DELETE /api/units/:id
  Response: { message: "Unit deleted" }
  Validation: Fails if unit has active assignments
  Auth: Admin required

POST /api/units/:id/workload
  Body: { workload_change, reason }
  Response: Updated unit with new metrics
  Auth: Admin required

POST /api/units/:id/patient-count
  Body: { patient_count }
  Response: Updated unit
  Auth: Admin required

GET /api/units/:id/workload-history
  Query params: limit (default 12)
  Response: Array of workload history entries

GET /api/units/:id/completed-interns
  Response: Array of interns who completed this unit

PUT /api/units/reorder
  Body: { order: [id1, id2, id3...] }
  Response: { success: true }
  Auth: Admin required
```

#### Rotations
```
GET /api/rotations
  Query params: intern_id, unit_id, status, batch
  Response: Array of rotation records

GET /api/rotations/current
  Response: Array of active rotations

GET /api/rotations/upcoming
  Response: Array of future rotations

POST /api/rotations
  Body: { intern_id, unit_id, start_date, end_date, status }
  Response: Created rotation
  Auth: Admin required

PUT /api/rotations/:id
  Body: Partial rotation fields
  Response: Updated rotation
  Auth: Admin required

DELETE /api/rotations/:id
  Response: { message: "Rotation deleted" }
  Auth: Admin required

POST /api/rotations/generate
  Body: { start_date }
  Response: { rotations: [...], message }
  Description: Auto-generates rotation schedule for all active interns
  Auth: Admin required

POST /api/rotations/auto-advance
  Response: { advanced: count, message }
  Description: Advances interns to next rotation if current ended
  Auth: Admin required

POST /api/rotations/fix-end-dates
  Response: { fixed: count }
  Description: Repairs rotation end dates based on duration settings
  Auth: Admin required
```

#### Activity Logs
```
GET /api/activity/recent
  Query params: limit (default 10)
  Response: Array of recent activity log entries

DELETE /api/activity/clear
  Response: { message: "Activity logs cleared", deletedCount }
  Auth: Admin required
```

#### Settings
```
GET /api/settings/system
  Response: { rotation_duration_weeks, allow_reassignment, auto_log_activity }

PUT /api/settings/system
  Body: Partial settings object
  Response: Updated settings
  Auth: Admin required
```

---

## Data Model

### Database: PostgreSQL (Supabase)
Connection managed via `DATABASE_URL` environment variable.

### Active Tables

#### `interns`
Primary table for intern records.

```sql
CREATE TABLE interns (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  registration_number VARCHAR(100) UNIQUE NOT NULL,
  batch VARCHAR(50),
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  status VARCHAR(20) DEFAULT 'active',  -- 'active', 'completed', 'extended'
  current_unit INTEGER REFERENCES units(id),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

**Key Fields:**
- `current_unit`: Foreign key to units table, tracks active assignment
- `status`: Lifecycle state (active, completed, extended)
- `batch`: Cohort identifier for grouping interns

**Indexes:**
- Primary key on `id`
- Unique constraint on `registration_number`
- Index on `status` for filtering
- Index on `current_unit` for joins

---

#### `units`
Hospital clinical units/departments.

```sql
CREATE TABLE units (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL UNIQUE,
  capacity INTEGER DEFAULT 2,
  patient_count INTEGER DEFAULT 0,
  display_order INTEGER DEFAULT 0,
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

**Key Fields:**
- `capacity`: Maximum number of interns unit can handle
- `patient_count`: Current patient load (for workload balancing)
- `display_order`: Sequence in rotation cycle (used by auto-generation)
- `active`: Soft delete flag (inactive units excluded from new rotations)

**Indexes:**
- Primary key on `id`
- Unique constraint on `name`
- Index on `display_order` for efficient ordering
- Index on `active` for filtering

---

#### `rotations`
Assignment records linking interns to units over time.

```sql
CREATE TABLE rotations (
  id SERIAL PRIMARY KEY,
  intern_id INTEGER NOT NULL REFERENCES interns(id) ON DELETE CASCADE,
  unit_id INTEGER NOT NULL REFERENCES units(id) ON DELETE CASCADE,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  status VARCHAR(20) DEFAULT 'pending',  -- 'pending', 'active', 'completed'
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

**Key Fields:**
- `intern_id`: Foreign key to interns (cascade delete)
- `unit_id`: Foreign key to units (cascade delete)
- `start_date`, `end_date`: Define rotation period
- `status`: Rotation lifecycle (pending, active, completed)

**Indexes:**
- Primary key on `id`
- Index on `intern_id` for schedule queries
- Index on `unit_id` for unit assignment queries
- Composite index on `(intern_id, start_date)` for timeline queries
- Index on `status` for filtering active rotations

**Constraints:**
- Foreign keys with CASCADE delete (removing intern/unit removes rotations)
- Date validation: `end_date` must be after `start_date`

---

#### `activity_logs`
Audit trail for all system changes.

```sql
CREATE TABLE activity_logs (
  id SERIAL PRIMARY KEY,
  action VARCHAR(100) NOT NULL,  -- e.g., 'intern_created', 'unit_deleted'
  description TEXT,
  entity_type VARCHAR(50),       -- 'intern', 'unit', 'rotation'
  entity_id INTEGER,
  metadata JSONB,                -- Additional context data
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

**Key Fields:**
- `action`: Event type identifier
- `description`: Human-readable log message
- `entity_type`, `entity_id`: Link to affected record
- `metadata`: Flexible JSON field for additional context (old/new values, user info, etc.)

**Indexes:**
- Primary key on `id`
- Index on `created_at DESC` for recent activity queries
- Index on `entity_type, entity_id` for entity-specific activity

**Common Actions:**
- `intern_created`, `intern_updated`, `intern_deleted`, `intern_extended`
- `unit_created`, `unit_updated`, `unit_deleted`, `unit_workload_updated`
- `rotation_created`, `rotation_updated`, `rotation_deleted`, `manual_assignment`

---

#### `system_settings`
Global configuration key-value store.

```sql
CREATE TABLE system_settings (
  id SERIAL PRIMARY KEY,
  key VARCHAR(100) UNIQUE NOT NULL,
  value TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

**Active Settings:**
- `rotation_duration_weeks`: Default rotation period (default: 4)
- `allow_reassignment`: Boolean flag for manual assignment feature
- `auto_log_activity`: Boolean flag for automatic activity logging

**Access Pattern:**
- Read on server startup
- Updated via `/api/settings/system` endpoint
- Cached in memory on backend (not re-queried per request)

---

### Data Access Patterns

#### Prisma Schema (Type Layer)
The system uses Prisma for type-safe data models but does not use Prisma Client for query execution in most routes.

**Schema Location:** `server/prisma/schema.prisma`

**Models Defined:**
- `Intern`, `Unit`, `Rotation`, `ActivityLog`, `SystemSetting`

**Purpose:**
- TypeScript type generation
- Migration management
- Future ORM migration path

#### SQL Wrapper (Active Layer)
Current routes use a SQL wrapper for database queries.

**Wrapper Location:** `server/database/dbWrapper.js`

**Functions:**
- `all(sql, params)` - SELECT queries returning array
- `get(sql, params)` - SELECT returning single row
- `run(sql, params)` - INSERT/UPDATE/DELETE operations

**Connection:**
- Direct PostgreSQL via `pg` library
- Connection pool managed in `server/database/postgres.js`
- IPv4 forced to avoid ENETUNREACH errors

---

## Architecture & Tech Stack

### System Architecture
**Deployment Model:** Decoupled SPA + API

```
┌─────────────────────────────────────────────────────────┐
│  Frontend (Vercel)                                      │
│  Domain: spin-interns.vercel.app                        │
│  ├── React SPA (static build)                           │
│  └── API calls to backend via HTTPS                     │
└──────────────────┬──────────────────────────────────────┘
                   │
                   │ HTTPS
                   │
┌──────────────────▼──────────────────────────────────────┐
│  Backend API (Render)                                   │
│  Domain: spin-j3qw.onrender.com                         │
│  ├── Express.js server                                  │
│  ├── CORS configured for Vercel origin                  │
│  ├── Admin key middleware                               │
│  └── PostgreSQL connection pool                         │
└──────────────────┬──────────────────────────────────────┘
                   │
                   │ DATABASE_URL (PostgreSQL wire protocol)
                   │
┌──────────────────▼──────────────────────────────────────┐
│  Database (Supabase PostgreSQL)                         │
│  ├── Managed PostgreSQL instance                        │
│  ├── Connection pooling (pgBouncer)                     │
│  └── Automatic backups                                  │
└─────────────────────────────────────────────────────────┘
```

---

### Frontend Stack

**Core Framework:**
- **React 18.2** - UI library
- **React Router 6** - Client-side routing
- **TanStack Query (React Query)** - Server state management, caching, and synchronization

**UI Components:**
- **Tailwind CSS** - Utility-first styling
- **Radix UI** - Accessible component primitives (Dialog, Dropdown, Popover, etc.)
- **Lucide React** - Icon library
- **Custom component library** - `client/src/components/ui/` (Button, Card, Input, Label, etc.)

**Build Tools:**
- **React Scripts** (Create React App) - Build configuration
- **PostCSS** - CSS processing
- **Tailwind JIT** - Just-in-time CSS compilation

**Key Frontend Files:**
- `client/src/App.js` - Route configuration
- `client/src/components/Layout.js` - App shell with navigation and auth gate
- `client/src/services/api.js` - Centralized API client with axios interceptors
- `client/src/pages/` - Page-level components

**State Management Strategy:**
- Server state: TanStack Query (caching, background refetch, optimistic updates)
- UI state: React useState/useReducer
- Global state: localStorage for role/adminKey
- No Redux, Context, or other global state library

---

### Backend Stack

**Core Framework:**
- **Node.js 20** - Runtime
- **Express 4.18** - Web framework
- **CORS** - Cross-origin resource sharing middleware

**Database:**
- **PostgreSQL 14+** - Primary database (Supabase hosted)
- **pg 8.x** - PostgreSQL client library
- **Prisma 5.x** - Schema management and migrations (ORM not actively used in routes)

**Key Backend Files:**
- `server/index.js` - Application entry point, middleware, route mounting
- `server/routes/` - API route handlers (interns, units, rotations, settings, activity, config, debug)
- `server/services/` - Business logic layer (internService, rotationService, unitService)
- `server/database/init.js` - Database initialization and table creation
- `server/database/dbWrapper.js` - SQL query wrapper

**Middleware Chain:**
1. CORS (Vercel origin whitelisted)
2. JSON body parser
3. Request logging
4. Admin key verification (write operations only)
5. Route handlers
6. Error handler

---

### Environment Variables

**Required:**
- `DATABASE_URL` - PostgreSQL connection string (includes host, port, database, user, password, SSL)
- `ADMIN_PASSWORD` - Shared admin key for write operations

**Optional:**
- `PORT` - Server port (default: 5000)
- `NODE_ENV` - Environment mode (development/production)
- `AUTO_ROTATION` - Enable auto-advance on startup (default: true, set to 'false' to disable)

**Production Configuration (Render):**
```bash
DATABASE_URL=postgresql://user:pass@host:5432/dbname?sslmode=require
ADMIN_PASSWORD=<secure-password>
PORT=5000
NODE_ENV=production
```

**Development Configuration:**
```bash
DATABASE_URL=postgresql://localhost:5432/spin_dev
ADMIN_PASSWORD=admin123
```

---

### Security Model

**Authentication:**
- Single shared admin password (no user accounts)
- Password verified via `/api/auth/verify-admin`
- Password stored client-side in localStorage
- No session management or JWT

**Authorization:**
- Middleware checks `x-admin-key` header on POST/PUT/DELETE
- Invalid/missing key returns 401 Unauthorized
- Read operations (GET) are public
- No role-based permissions beyond admin/guest distinction

**CORS:**
- Origin restricted to `https://spin-interns.vercel.app`
- Credentials enabled
- Preflight OPTIONS requests handled

**Data Validation:**
- Input validation on API endpoints (express-validator could be added)
- SQL injection protection via parameterized queries
- Foreign key constraints enforce referential integrity

**Known Limitations:**
- Single admin password shared by all administrators
- No audit trail of which admin performed actions
- Admin key stored in plain text in localStorage (vulnerable to XSS)
- No rate limiting on API endpoints
- No HTTPS enforcement on API (relies on platform SSL)

---

## Deployment & Operations

### Production Infrastructure

**Frontend Deployment (Vercel):**
- **Platform:** Vercel
- **Build Command:** `cd client && npm run build`
- **Output Directory:** `client/build`
- **Domain:** `spin-interns.vercel.app`
- **SSL:** Automatic (Vercel-managed)
- **CDN:** Vercel Edge Network
- **Environment Variables:** None required (API URL hardcoded in client)

**Backend Deployment (Render):**
- **Platform:** Render (Web Service)
- **Repository:** Auto-deployed from Git
- **Build Command:** `cd server && npm install`
- **Start Command:** `cd server && node index.js`
- **Instance Type:** Free tier (spins down after inactivity)
- **Region:** US (configurable)
- **Health Check:** `GET /api/health` (30s interval)
- **Environment Variables:**
  ```
  DATABASE_URL=<supabase-connection-string>
  ADMIN_PASSWORD=<secure-password>
  PORT=5000
  ```

**Database Deployment (Supabase):**
- **Platform:** Supabase (managed PostgreSQL)
- **Version:** PostgreSQL 14+
- **Connection:** Pooled via pgBouncer
- **SSL:** Required (enforced by connection string)
- **Backups:** Automated daily (Supabase-managed)
- **Region:** Configurable (should match Render for latency)

**Alternative Deployment (Railway):**
Configuration files exist for Railway platform:
- `railway.json` - Service configuration
- Deployment steps documented in `DEPLOY_RAILWAY.md`
- Same environment variable requirements

---

### Docker Containerization

**Dockerfile:** `SPIN/Dockerfile`

**Build Strategy:**
- Multi-stage build (future optimization opportunity)
- Node 20 base image
- Installs dependencies for both client and server
- Builds React frontend
- Exposes port 5000
- Starts Express server (serves API + static frontend)

**Build Command:**
```bash
docker build -t spin-app .
```

**Run Command:**
```bash
docker run -p 5000:5000 \
  -e DATABASE_URL=<connection-string> \
  -e ADMIN_PASSWORD=<password> \
  spin-app
```

**Container Contents:**
- Backend API (Node/Express)
- Frontend build (static files served by Express)
- No database (expects external PostgreSQL)

---

### Database Management

#### Initialization
**Script:** `server/database/init.js`

**Process:**
1. Tests PostgreSQL connection (5 retries with exponential backoff)
2. Creates tables if not exist (interns, units, rotations, activity_logs, system_settings)
3. Creates indexes for query optimization
4. Seeds default system settings if empty
5. Logs success/failure details

**Startup Behavior:**
- Non-blocking: Server starts even if DB initialization fails
- Retry logic handles transient network issues
- IPv4 forced in connection config to avoid ENETUNREACH errors

#### Migrations
**Tool:** Prisma Migrate

**Migration Files:** `server/prisma/migrations/`

**Active Migrations:**
- `20240101000000_init` - Initial schema creation

**Migration Commands:**
```bash
cd server
npx prisma migrate deploy  # Apply pending migrations (production)
npx prisma migrate dev     # Create new migration (development)
npx prisma generate        # Regenerate Prisma Client types
```

**Migration Policy:**
- Production: Migrations auto-applied on deployment (if configured)
- Development: Manual migration creation and testing
- Schema changes must go through Prisma migration workflow

#### Schema Verification
**Script:** `server/prisma/verify.js`

**Purpose:**
- Validates database schema matches Prisma schema
- Checks table existence
- Verifies column types and constraints
- Reports discrepancies

**Usage:**
```bash
cd server
node prisma/verify.js
```

---

### Operations & Monitoring

#### Health Checks
**Endpoint:** `GET /api/health`

**Response:**
```json
{
  "status": "OK",
  "message": "SPIN API is running",
  "timestamp": "2026-03-04T12:00:00.000Z"
}
```

**Monitoring:**
- Render platform checks this endpoint every 30 seconds
- Failures trigger alert (if configured)
- Used for uptime monitoring

#### Logging
**Strategy:** Console logging (stdout/stderr)

**Log Levels:**
- Request logs: `[timestamp] METHOD /path`
- Error logs: Full stack traces for 500 errors
- Startup logs: Environment summary, route loading status
- Database logs: Connection status, retry attempts, query errors

**Production Logging:**
- Logs captured by Render platform
- Accessible via Render dashboard (Logs tab)
- Limited retention (free tier: 7 days)

#### Error Handling
**Patterns:**
- Try-catch blocks in async route handlers
- Global error middleware catches unhandled errors
- 500 errors return generic message in production (stack trace in development)
- Database errors logged with context (query, params)

---

### Backup & Recovery

**Documentation:** `SPIN/BACKUP_SETUP.md`

**Database Backups:**
- **Automatic:** Supabase performs daily backups (managed service)
- **Manual:** SQL dump via `pg_dump` (documented in backup guide)
- **Retention:** Supabase free tier: 7 days, paid: configurable

**Backup Command (Manual):**
```bash
pg_dump $DATABASE_URL > backup-$(date +%Y%m%d).sql
```

**Restore Command:**
```bash
psql $DATABASE_URL < backup-20260304.sql
```

**Backup Services (Code Exists, Not Active):**
- `server/services/cloudBackup.js` - Automated backup to cloud storage
- `server/services/autoRestore.js` - Scheduled restore testing
- **Status:** Implemented but not wired to server startup

---

## Testing & Validation

### API Testing Scripts

#### 1. API Flow Test
**Script:** `test-api-flow.ps1` (PowerShell)

**Purpose:** End-to-end API workflow validation

**Test Scenarios:**
- Health check connectivity
- Admin authentication
- CRUD operations on interns
- CRUD operations on units
- Rotation generation
- Extension workflow
- Activity log verification

**Usage:**
```powershell
.\test-api-flow.ps1
```

**Output:** Console log with pass/fail for each scenario

---

#### 2. Unit Delete Test
**Script:** `test-unit-delete.js` (Node.js)

**Purpose:** Validates unit deletion constraints

**Test Cases:**
- Delete empty unit (should succeed)
- Delete unit with active interns (should fail with validation error)
- Cascade delete verification (rotations cleaned up)

**Usage:**
```bash
node test-unit-delete.js
```

---

#### 3. Production Validation
**Script:** `VALIDATE_FIXES.js`

**Purpose:** Regression testing for production fixes

**Validates:**
- Rotation end date calculations
- Unit deletion constraints
- Extension logic
- Activity log integrity

**Usage:**
```bash
node VALIDATE_FIXES.js
```

---

### Unit Tests

#### Intern Schedule Service Tests
**File:** `server/services/internScheduleService.test.js`

**Framework:** Jest (assumed, based on `.test.js` naming)

**Test Coverage:**
- Schedule generation for new interns
- Rotation sequence validation
- End date calculations
- Extension impact on schedule

**Run Command:**
```bash
cd server
npm test
```

---

### Manual Testing

**Database Debug Script:**
**File:** `server/debug-db-connection.js`

**Purpose:**
- Validates DATABASE_URL connection
- Tests IPv4/IPv6 connectivity
- Checks SSL configuration
- Verifies table existence

**Usage:**
```bash
node server/debug-db-connection.js
```

---

### Test Data Generation

**Seed Script:** `server/prisma/seed.js`

**Purpose:**
- Creates sample interns, units, rotations for testing
- Resets database to known state
- Useful for development and demo environments

**Usage:**
```bash
cd server
npx prisma db seed
```

**Seed Data:**
- 5 sample units (Orthopedics, Neurology, Pediatrics, Cardiology, Geriatrics)
- 3 sample interns (varying statuses)
- Initial rotation assignments

---

## Not in Active Scope

### Features Removed or Disabled

#### 1. Rotations UI Page
- **File:** `client/src/pages/Rotations.js` exists but not routed
- **Route:** Removed from `client/src/App.js` (commented out)
- **Evidence:** Line 19 in App.js: `{/* Rotations route removed */}`
- **Reason:** Redundant with Interns > Schedule view
- **Status:** Code exists but not accessible to users

#### 2. Settings UI Subcomponents
- **Files:** `client/src/components/settings/` directory exists
- **Status:** Not imported or rendered in active Settings page
- **Evidence:** Settings.js only shows system settings form, not advanced subcomponents
- **Reason:** Scope reduced to core settings only

#### 3. Scheduler/Auto-Advance Services (Automated)
- **Files:** 
  - `server/services/scheduler.js` - Cron-based task scheduler
  - `server/services/autoRestore.js` - Scheduled DB restores
- **Status:** Implemented but not started in `server/index.js`
- **Evidence:** No `scheduler.start()` call in server startup
- **Reason:** Manual trigger preferred over automated background tasks
- **Workaround:** Auto-advance can be triggered via API endpoint

#### 4. Cloud Backup Service
- **File:** `server/services/cloudBackup.js`
- **Status:** Implemented but not wired to any route or schedule
- **Evidence:** Not imported in server/index.js or any route
- **Reason:** Manual backups via Supabase dashboard preferred

#### 5. Prisma Client in Routes
- **File:** `server/database/prisma.js` exports Prisma Client
- **Status:** Exists but not used in active route files
- **Evidence:** Routes use `dbWrapper.js` SQL functions instead
- **Reason:** Legacy SQL wrapper retained during migration
- **Future:** May transition to Prisma ORM for type safety

#### 6. SQLite Support
- **Evidence:** `server/env.example` mentions SQLite fallback
- **Reality:** `server/database/init.js` hard-requires DATABASE_URL (PostgreSQL only)
- **Status:** SQLite code path removed, env docs outdated
- **Current:** PostgreSQL is the only supported database

---

### Deprecated Scripts

#### 1. cleanup-schedule.js
- **File:** `scripts/cleanupSchedule.js`
- **Purpose:** Legacy rotation cleanup utility
- **Status:** Superseded by `/api/rotations/fix-end-dates` endpoint
- **Recommendation:** Safe to archive

#### 2. migrate-units.js
- **File:** `scripts/migrateUnits.js`
- **Purpose:** One-time data migration for unit schema change
- **Status:** Migration complete, script no longer needed
- **Recommendation:** Safe to archive

---

### Documentation for Retired Features

**Files:**
- `ROTATION_GENERATION_FIX.md` - Historical fix documentation
- `UNIT_DELETE_FIX.md` - Historical fix documentation
- `PRODUCTION_FIXES_SUMMARY.md` - Changelog of resolved issues
- `QUICK_FIX_REFERENCE.md` - Emergency resolution guide

**Status:** Kept for historical reference but describe resolved issues, not active features

---

## Summary

SPIN is a fully functional internship scheduling system actively deployed and serving the UNTH Physiotherapy Department. The system provides:

✅ **Complete Intern Lifecycle Management** - From admission to completion  
✅ **Dynamic Unit Configuration** - Flexible hospital department setup  
✅ **Automated Rotation Scheduling** - Intelligent workload-balanced assignment  
✅ **Manual Override Capability** - Administrative control when needed  
✅ **Activity Audit Trail** - Full system change history  
✅ **Role-Based Access** - Admin write access, guest read-only viewing  
✅ **Production-Ready Deployment** - Decoupled SPA + API architecture  
✅ **Database Reliability** - PostgreSQL with automatic backups  
✅ **Comprehensive Testing** - API tests and validation scripts  

**Active Users:** Hospital administrators and department coordinators  
**Current Status:** In production use  
**Maintenance Mode:** Stable with ongoing feature refinement  

---

**For questions or contributions, contact the development team via WhatsApp: +234 906 836 1100**
