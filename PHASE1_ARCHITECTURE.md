# SPIN 1.0 Phase 1 Architecture

## System Diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│                          FRONTEND (Client)                          │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  Dashboard.js                                                       │
│  ├─ useQuery('interns')          ← Fetches from /api/interns      │
│  │                                                                  │
│  ├─ buildAwaitingConfirmations() ← New Phase 1 function            │
│  │  ├─ Filter rotations.status === 'awaiting_confirmation'        │
│  │  ├─ Calculate elapsedDays (can exceed duration)                │
│  │  └─ Return sorted by days_exceeded                             │
│  │                                                                  │
│  └─ Render Section: "Awaiting Confirmation..."                     │
│     ├─ Card per awaiting intern                                    │
│     ├─ Show: Name, Current Unit, Duration, Next Unit              │
│     ├─ Show: Days Exceeded badge                                   │
│     └─ Accept/Reassign buttons (disabled in Phase 1)              │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
         │                            ▲
         │ GET /api/interns           │ Response with rotations
         │ (fetch interns)            │ (includes status field)
         ▼                            │
┌─────────────────────────────────────────────────────────────────────┐
│                          BACKEND (Server)                           │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  interns.js (Routes)                                               │
│  └─ GET /api/interns                                               │
│     ├─ Find all interns                                            │
│     ├─ checkAndMarkAwaitingConfirmation(internId)  ← NEW!         │
│     │  │  For each intern:                                         │
│     │  │  ├─ Find active rotation                                  │
│     │  │  ├─ Check: today >= endDate?                             │
│     │  │  ├─ If YES: Find next "upcoming" rotation               │
│     │  │  ├─ Set status → "awaiting_confirmation"                 │
│     │  │  └─ Log: "[PHASE 1] Awaiting Confirmation: [name]"       │
│     │  │                                                           │
│     ├─ syncInternRotationStates()                                  │
│     ├─ buildInternViews()                                          │
│     │  ├─ Get rotations for each intern                            │
│     │  ├─ formatIntern() returns rotations[].status               │
│     │  └─ Returns: { id, name, rotations: [...], ... }           │
│     │                                                              │
│     └─ Return formatted interns to client                          │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
         │
         └─────────────────┬────────────────────┘
                           │
                    Calls multiple services
                           │
┌──────────────────────────────────────────────────────────────────────┐
│                      SERVICES LAYER                                  │
├──────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  rotationService.js                                                 │
│  ├─ autoAdvanceRotation() ❌ DISABLED                               │
│  │  └─ Returns: false                                               │
│  │     Logs: "[PHASE 1] autoAdvanceRotation is disabled..."        │
│  │                                                                  │
│  ├─ checkAndMarkAwaitingConfirmation(internId) ✅ NEW             │
│  │  ├─ Get current active rotation                                 │
│  │  ├─ Check if expired: today >= endDate                         │
│  │  ├─ Get next rotation (upcoming/awaiting_confirmation)          │
│  │  ├─ Update status: "awaiting_confirmation"                      │
│  │  └─ Log debug message                                           │
│  │                                                                  │
│  └─ createManualRotation()                                          │
│     └─ Still creates rotations with status: 'active'               │
│                                                                      │
│  internViewService.js                                              │
│  ├─ calculateElapsedDays()  🔧 FIXED                              │
│  │  ├─ OLD: return Math.min(duration, elapsedDays)  ❌            │
│  │  └─ NEW: return elapsedDays  ✅                                 │
│  │          (Allows overflow: 21/20, 22/20, 25/20)                │
│  │                                                                  │
│  ├─ formatIntern()                                                 │
│  │  └─ returns: { rotations: [...], ... }                         │
│  │             (includes rotation with status field)              │
│  │                                                                  │
│  └─ buildInternViews()                                              │
│     └─ Returns formatted interns with rotations                    │
│                                                                      │
└──────────────────────────────────────────────────────────────────────┘
         │
         └─────────────────┬────────────────────┘
                           │
┌──────────────────────────────────────────────────────────────────────┐
│                      DATABASE (MongoDB)                              │
├──────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  Intern                                                             │
│  ├─ _id, name, gender, batch                                       │
│  ├─ startDate, status, currentUnit                                 │
│  └─ rotationHistory (refs to Rotation docs)                        │
│                                                                      │
│  Rotation  ✅ UPDATED MODEL                                        │
│  ├─ _id, intern, unit                                              │
│  ├─ startDate, endDate, duration                                   │
│  ├─ baseDuration, extensionDays                                    │
│  ├─ status: ["active", "upcoming",                                 │
│  │           "awaiting_confirmation" ← NEW!, "completed"]         │
│  └─ createdAt                                                       │
│                                                                      │
│  Unit                                                               │
│  ├─ _id, name, order, duration                                     │
│  └─ capacity, durationDays                                         │
│                                                                      │
└──────────────────────────────────────────────────────────────────────┘
```

## State Transition Diagram

### Single Intern Lifecycle

```
┌────────────────────────────────────────────────────────────┐
│  PHASE 1: Confirmation-Based Movement (NEW)                │
└────────────────────────────────────────────────────────────┘

Day 1-20:
  ┌─────────────────┐
  │ Rotation: ACTIVE│         ┌──────────────────┐
  │ Unit: Neurology │────────▶│ Rotation: UPCOMING│
  │ 20/20 days      │         │ Unit: Pediatrics │
  │                 │         │ (not yet active) │
  └─────────────────┘         └──────────────────┘

Day 21 (Duration Exceeded):
  ┌─────────────────┐         ┌────────────────────────────┐
  │ Rotation: ACTIVE│         │ Rotation: AWAITING_CONFIRM │
  │ Unit: Neurology │────────▶│ Unit: Pediatrics           │
  │ 21/20 days ◄───┼─ CONVERTED FROM "upcoming"          │
  │ STAYED ACTIVE!  │         │ (waiting for admin click)  │
  └─────────────────┘         └────────────────────────────┘
        │                               │
        ▼                               ▼
  Day counter keeps growing      Admin sees card
  22/20, 23/20, 25/20           on Dashboard

Day 30+ (Phase 2):
  (Waiting for Admin Confirmation)
  └──▶ Click "Accept" or "Reassign" (Phase 2 feature)

After Confirmation (Phase 2):
  ┌──────────────────────┐     ┌─────────────────┐
  │ Rotation: COMPLETED  │     │ Rotation: ACTIVE│
  │ Unit: Neurology      │────▶│ Unit: Pediatrics│
  │                      │     │ (now active)    │
  └──────────────────────┘     └─────────────────┘
```

## Component Flow Diagram

```
┌──────────────────────────────────────────────────────────────┐
│ GET /api/interns Called (every time dashboard loads)        │
└──────────────────────────────────────────────────────────────┘
                           │
                           ▼
┌──────────────────────────────────────────────────────────────┐
│ interns.js Route Handler                                     │
├──────────────────────────────────────────────────────────────┤
│ 1. Get all intern IDs                                       │
│    ▼                                                         │
│ 2. checkAndMarkAwaitingConfirmation(internId) ← NEW        │
│    ├─ Find active rotation                                  │
│    ├─ Check expiration: today >= endDate?                  │
│    ├─ Convert next rotation to awaiting_confirmation        │
│    └─ Log debug message                                     │
│    ▼                                                         │
│ 3. syncInternRotationStates(internId)                       │
│    ▼                                                         │
│ 4. buildInternViews() with all internIds                    │
│    ├─ Fetch interns with currentUnit populated             │
│    ├─ Fetch all rotations for all interns                  │
│    ├─ Group rotations by intern                             │
│    └─ formatIntern() each one                              │
│       ├─ formatRotation() each rotation                     │
│       │  └─ Include status field                           │
│       ├─ Calculate currentUnitElapsedDays                  │
│       │  └─ Uses NEW calculateElapsedDays (allows overflow) │
│       └─ Return: {                                          │
│           id, name, rotations: [{                          │
│             status, startDate, endDate, duration, ...      │
│           }],                                               │
│           ...                                               │
│         }                                                   │
│    ▼                                                         │
│ 5. Sort interns and return to client                        │
└──────────────────────────────────────────────────────────────┘
                           │
                           ▼
┌──────────────────────────────────────────────────────────────┐
│ Frontend: Dashboard Component                                │
├──────────────────────────────────────────────────────────────┤
│ 1. Receive interns data with rotations[].status             │
│    ▼                                                         │
│ 2. Call buildAwaitingConfirmations(interns)                 │
│    ├─ Filter: rotations.status === "awaiting_confirmation"  │
│    ├─ Extract: currentUnit, nextUnit, elapsedDays           │
│    ├─ Calculate: daysExceeded = elapsedDays - duration     │
│    └─ Return array sorted by daysExceeded DESC             │
│    ▼                                                         │
│ 3. Render "Awaiting Confirmation" Section                   │
│    ├─ For each awaiting confirmation:                       │
│    │  ├─ Display card with:                                 │
│    │  │  ├─ Intern name                                     │
│    │  │  ├─ Current unit                                    │
│    │  │  ├─ Duration: "21/20" (elapsedDays/duration)       │
│    │  │  ├─ Days exceeded badge                             │
│    │  │  ├─ Next unit                                       │
│    │  │  └─ Accept/Reassign buttons (disabled)              │
│    │  └─ Orange styling for alert                           │
│    │                                                         │
│    └─ Show "No interns..." if empty                         │
│    ▼                                                         │
│ 4. Display on Dashboard                                     │
└──────────────────────────────────────────────────────────────┘
```

## API Flow

```
CLIENT                                    SERVER
  │                                         │
  ├─ GET /api/interns ────────────────────▶│
  │                                         │
  │                                ┌────────▼────────┐
  │                                │ Check & Mark    │
  │                                │ Awaiting Conf   │
  │                                │ for each intern │
  │                                └────────┬────────┘
  │                                         │
  │                                ┌────────▼────────────────┐
  │                                │ Build & Format          │
  │                                │ Intern Views with       │
  │                                │ rotations[].status      │
  │                                └────────┬────────────────┘
  │                                         │
  │◀────────── JSON Response ──────────────┤
  │{                                        │
  │  interns: [{                            │
  │    id, name, batch, status,             │
  │    rotations: [{                        │
  │      id, status, unitName,              │
  │      startDate, endDate, duration       │
  │    }],                                  │
  │    ...                                  │
  │  }]                                     │
  │}                                        │
  │                                         │
  ├─ Process in buildAwaitingConfirmations()
  │  (filter, calculate, sort)              │
  │                                         │
  └─ Render Dashboard with                 │
     "Awaiting Confirmation" cards          │
```

## Status Enum Evolution

```
BEFORE Phase 1:
┌─────────────────────────────────┐
│ rotation.status options:        │
│ • active      (in progress)     │
│ • upcoming    (not started)     │
│ • completed   (finished)        │
└─────────────────────────────────┘

AFTER Phase 1:
┌──────────────────────────────────────────┐
│ rotation.status options:                 │
│ • active              (in progress)      │
│ • upcoming            (not started)      │
│ • awaiting_confirmation ← NEW!           │
│   (completed duration, waiting for move) │
│ • completed           (finished)         │
└──────────────────────────────────────────┘
```

## Key Function Signatures

```javascript
// NEW in Phase 1
async checkAndMarkAwaitingConfirmation(internId, today = new Date())
  - Checks if current rotation expired
  - Converts next upcoming → awaiting_confirmation
  - Returns: rotationObject or null

// MODIFIED in Phase 1
calculateElapsedDays(startDate, durationDays, todayDate = new Date())
  - OLD: Math.min(duration, elapsedDays)
  - NEW: elapsedDays (allows overflow)
  
// NEW in Phase 1
export buildAwaitingConfirmations(interns, referenceDate = new Date())
  - Filters rotations by "awaiting_confirmation" status
  - Returns array of awaiting interns sorted by days exceeded

// DISABLED in Phase 1
async autoAdvanceRotation(internId)
  - Returns false with warning log
```

## State Management Summary

```
MEMORY STATE (in database):
├─ Rotation.status = "awaiting_confirmation" ← indicates waiting
├─ Rotation.active still active (not completed)
├─ Next Rotation.status (no longer auto "active")
└─ Intern.currentUnit unchanged

UI STATE (in frontend):
├─ awaitingConfirmations array (from buildAwaitingConfirmations)
├─ Each item shows: name, currentUnit, duration, nextUnit, days exceeded
└─ Buttons visible but disabled (Phase 2 will enable)
```
