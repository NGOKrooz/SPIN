# Balanced Auto-Rotation Engine

## Overview
The SPIN system now uses a balanced, round-robin distribution algorithm to assign interns to units, ensuring even distribution and preventing clustering.

## The Problem (Before)
Previously, all interns started their rotations at the same unit (typically Unit 1), which meant:
- Units were unevenly utilized
- Some units would be overcrowded while others remained empty
- Predictable patterns made scheduling less flexible

## The Solution (Now)

### Core Approach: Unit Reordering + Index-Based Offset

Instead of using a formula, we **reorder the entire units array** for each intern based on their index:

```javascript
// 1. Shuffle units slightly for variety (once per batch)
const shuffledUnits = units.sort(() => Math.random() - 0.5);

// 2. Each intern gets a different starting offset
const startUnitIndex = internIndex % units.length;

// 3. Reorder units array for this intern
const orderedUnits = [
  ...units.slice(startUnitIndex),      // From start position to end
  ...units.slice(0, startUnitIndex)     // Wrap around: beginning to start
];

// 4. Intern cycles through their ordered units sequentially
for (let i = 0; i < orderedUnits.length; i++) {
  const unit = orderedUnits[i];
  // Create rotation...
}
```

This ensures:
- **Even distribution**: Each intern starts at a different unit
- **Complete coverage**: Every intern rotates through ALL units
- **Staggered timing**: No clustering or overlapping
- **Light randomness**: Shuffled units prevent fixed patterns

### Example Distribution
With 5 units (shuffled: [U3, U1, U5, U2, U4]) and 3 interns:

| Intern | Start Offset | Rotation 1 | Rotation 2 | Rotation 3 | Rotation 4 | Rotation 5 |
|--------|--------------|------------|------------|------------|------------|------------|
| Intern 0 | Offset 0 | U3 | U1 | U5 | U2 | U4 |
| Intern 1 | Offset 1 | U1 | U5 | U2 | U4 | U3 |
| Intern 2 | Offset 2 | U5 | U2 | U4 | U3 | U1 |

Notice how:
- Each intern starts at a **different unit**
- Each intern visits **all units** in their own order
- The distribution is **perfectly staggered**
- Units are **shuffled** to avoid predictable patterns

## Implementation Details

### 1. Batch Rotation Generation (`/api/rotations/generate`)
When generating rotations for all interns:

```javascript
// Shuffle units once for the entire batch
const shuffledUnits = [...units].sort(() => Math.random() - 0.5);

// Loop through interns with index
for (let internIndex = 0; internIndex < interns.length; internIndex++) {
  const intern = interns[internIndex];
  const rotations = generateInternRotations(
    intern, 
    shuffledUnits, 
    startDate, 
    settings,
    internIndex  // Pass index for offset calculation
  );
}
```

### 2. Individual Intern Rotation (`generateInternRotations`)
For each intern, reorder units based on their index:

```javascript
// Calculate starting offset
const startUnitIndex = internIndex % units.length;

// Reorder units array
const orderedUnits = [
  ...units.slice(startUnitIndex),   // Units from offset to end
  ...units.slice(0, startUnitIndex) // Units from start to offset
];

// Cycle through ordered units sequentially
for (let i = 0; i < orderedUnits.length; i++) {
  const unit = orderedUnits[i];
  // Create rotation with this unit...
}
```

### 3. Auto-Advance Rotations (`autoAdvanceRotations`)
When automatically advancing interns to their next rotation:

```javascript
// Get all interns ordered consistently
const interns = await getActiveInterns(); // Ordered by ID

// For each intern, use their index
for (let internIndex = 0; internIndex < interns.length; internIndex++) {
  const intern = interns[internIndex];
  
  // Reorder units based on their index
  const startUnitIndex = internIndex % units.length;
  const orderedUnits = [
    ...units.slice(startUnitIndex),
    ...units.slice(0, startUnitIndex)
  ];
  
  // Pick next unit in their sequence
  const nextUnit = orderedUnits[rotationCount % orderedUnits.length];
}
```

This maintains consistency with the initial generation, ensuring each intern continues their unique rotation pattern.

## Extension System: Proportional Duration Increase

### How Extensions Work

When an intern receives an extension (e.g., 90 extra days), those days are **proportionally distributed across all units**, not just added at the end. This ensures the intern spends more time in each unit rather than doing more cycles.

### Example Calculation

**Scenario:**
- Base internship: 365 days
- Extension: 90 days
- Total: 455 days
- Number of units: 10
- Base duration per unit: 36.5 days

**Without Proportional Extension (old approach):**
- Each unit: 36.5 days
- Result: More cycles through all units

**With Proportional Extension (new approach):**
- Extension multiplier: 455 / 365 = 1.247
- Each unit: ~45.5 days (36.5 × 1.247)
- Result: Longer, more meaningful rotations in each unit

### Formula

```javascript
// Calculate extension multiplier
const baseRotationDays = units.reduce((sum, unit) => sum + unit.duration_days, 0);
const extensionMultiplier = internshipDuration / baseRotationDays;
const cycles = Math.ceil(extensionMultiplier);

// Apply to each unit
const extendedUnitDuration = Math.round(unit.duration_days * extensionMultiplier / cycles);
```

### Real-World Example

**Setup:**
- 10 units with durations: [30, 35, 40, 30, 28, 42, 38, 30, 35, 27] days
- Total base rotation days: 335 days
- Base internship: 365 days
- Extension: 90 days → Total: 455 days

**Calculations:**
- Extension multiplier: 455 / 335 = 1.358
- Cycles needed: 2 (since we need to fit 455 days)

**Unit Durations:**

| Unit | Base Duration | Extended Duration | Difference |
|------|---------------|-------------------|------------|
| Unit 1 | 30 days | 41 days | +11 days |
| Unit 2 | 35 days | 48 days | +13 days |
| Unit 3 | 40 days | 54 days | +14 days |
| Unit 4 | 30 days | 41 days | +11 days |
| Unit 5 | 28 days | 38 days | +10 days |
| Unit 6 | 42 days | 57 days | +15 days |
| Unit 7 | 38 days | 52 days | +14 days |
| Unit 8 | 30 days | 41 days | +11 days |
| Unit 9 | 35 days | 48 days | +13 days |
| Unit 10 | 27 days | 37 days | +10 days |

**Result:** Every unit rotation is proportionally longer, giving the intern more meaningful time in each department!

### Benefits of Proportional Extension

✅ **Deeper Learning**: Interns spend more time in each unit to gain expertise  
✅ **Consistent Experience**: All units benefit from the extension, not just the last few  
✅ **Better Workload Distribution**: Extended time is spread evenly across departments  
✅ **Automatic Calculation**: System handles all the math automatically  
✅ **Fair to All Departments**: No department is excluded from the extension benefit  

## Benefits

✅ **Even Distribution**: No unit is overloaded or underutilized  
✅ **Automatic Balancing**: Works without manual intervention  
✅ **Scalable**: Works with any number of interns and units  
✅ **Predictable Yet Flexible**: Core logic is deterministic, with optional randomness  
✅ **Wrap-Around**: Automatically cycles back to the beginning after all units  
✅ **Proportional Extensions**: Extension days are distributed across all units evenly  

## Key Changes Made

### File: `server/routes/rotations.js`

#### 1. Batch Generation Updates (`/generate` endpoint)
**Lines 335-360**: Shuffle units and pass intern index
```javascript
// Shuffle units once for the entire batch
const shuffledUnits = [...units].sort(() => Math.random() - 0.5);

// Loop with index
for (let internIndex = 0; internIndex < interns.length; internIndex++) {
  const intern = interns[internIndex];
  const rotations = generateInternRotations(
    intern, 
    shuffledUnits, 
    startDate, 
    settings,
    internIndex  // NEW: Pass intern index
  );
}
```

#### 2. Updated `generateInternRotations` Function
**Line 788**: Added `internIndex` parameter
- Old: `function generateInternRotations(intern, units, startDate, settings)`
- New: `function generateInternRotations(intern, units, startDate, settings, internIndex = 0)`

**Lines 807-813**: Reorder units based on intern index
```javascript
const startUnitIndex = internIndex % units.length;
const orderedUnits = [
  ...units.slice(startUnitIndex),
  ...units.slice(0, startUnitIndex)
];
```

**Line 820**: Use reordered units
- Old: `const unit = units[unitIndex];`
- New: `const unit = orderedUnits[unitIndex];`

#### 3. Proportional Extension System
**Lines 797-805**: Extension multiplier calculation
```javascript
const baseRotationDays = units.reduce((sum, unit) => sum + unit.duration_days, 0);
const extensionMultiplier = internshipDuration / baseRotationDays;
const cycles = Math.ceil(extensionMultiplier);
```

**Line 827**: Apply extended duration
```javascript
const extendedUnitDuration = Math.round(unit.duration_days * extensionMultiplier / cycles);
```

#### 4. Auto-Advance Updates
**Lines 500-516**: Loop with intern index
```javascript
const interns = await getActiveInterns(); // Ordered by ID
for (let internIndex = 0; internIndex < interns.length; internIndex++) {
  const intern = interns[internIndex];
  // ...
}
```

**Lines 687-697**: Use intern index for unit selection
```javascript
const startUnitIndex = internIndex % units.length;
const orderedUnits = [
  ...units.slice(startUnitIndex),
  ...units.slice(0, startUnitIndex)
];
const nextUnitInSequence = orderedUnits[rotationCount % orderedUnits.length];
```

## Usage

No configuration changes needed! The system will automatically:
- Distribute new interns evenly across units
- Advance existing interns through their rotations in a balanced manner
- Ensure every unit gets appropriate coverage

## Testing

To test the new distribution:
1. Create multiple interns with different IDs
2. Generate rotations using `/api/rotations/generate`
3. Observe that interns start at different units
4. Check that rotations cycle through all units evenly

---

*Last updated: November 8, 2025*

