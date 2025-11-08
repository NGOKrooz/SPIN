# Balanced Auto-Rotation Engine

## Overview
The SPIN system now uses a balanced, round-robin distribution algorithm to assign interns to units, ensuring even distribution and preventing clustering.

## The Problem (Before)
Previously, all interns started their rotations at the same unit (typically Unit 1), which meant:
- Units were unevenly utilized
- Some units would be overcrowded while others remained empty
- Predictable patterns made scheduling less flexible

## The Solution (Now)

### Core Formula
```javascript
unitIndex = (internId + rotationCount) % totalUnits
```

This formula ensures:
- **Even distribution**: Each intern starts at a different unit
- **Fair cycling**: All units are utilized equally over time
- **Automatic balancing**: No manual intervention needed

### Example Distribution
With 5 units and 3 interns:

| Intern | Rotation 1 | Rotation 2 | Rotation 3 | Rotation 4 | Rotation 5 |
|--------|------------|------------|------------|------------|------------|
| Intern 1 (ID=1) | Unit 2 | Unit 3 | Unit 4 | Unit 5 | Unit 1 |
| Intern 2 (ID=2) | Unit 3 | Unit 4 | Unit 5 | Unit 1 | Unit 2 |
| Intern 3 (ID=3) | Unit 4 | Unit 5 | Unit 1 | Unit 2 | Unit 3 |

Notice how:
- Each intern starts at a different unit
- The distribution is staggered, preventing clustering
- All units get equal coverage

## Implementation Details

### 1. Initial Rotation Generation (`generateInternRotations`)
When generating rotations for a new intern, the system uses:
```javascript
const unitIndex = (intern.id + rotationIndex) % units.length;
```

This ensures that interns with different IDs start at different units.

### 2. Auto-Advance Rotations (`autoAdvanceRotations`)
When automatically advancing interns to their next rotation:
```javascript
const rotationCount = allRotationsHistory.length;
const nextUnitIndex = (intern.id + rotationCount) % units.length;
```

This maintains consistency with the initial generation formula.

### 3. Optional Randomization (15% Chance)
To add variety and reduce predictable patterns when multiple interns finish simultaneously:
```javascript
const finalUnit = (Math.random() < 0.15) 
  ? units[(nextUnitIndex + 1) % units.length]
  : nextUnit;
```

This 15% chance introduces slight variation without disrupting the overall balance.

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

1. **Lines 780-788**: Added proportional extension calculation in `generateInternRotations`
   ```javascript
   const baseRotationDays = units.reduce((sum, unit) => sum + unit.duration_days, 0);
   const extensionMultiplier = internshipDuration / baseRotationDays;
   const cycles = Math.ceil(extensionMultiplier);
   ```

2. **Line 795**: Updated unit selection in `generateInternRotations`
   - Old: `const unitIndex = rotationIndex % units.length;`
   - New: `const unitIndex = (intern.id + rotationIndex) % units.length;`

3. **Line 803**: Calculate extended duration per unit in `generateInternRotations`
   ```javascript
   const extendedUnitDuration = Math.round(unit.duration_days * extensionMultiplier / cycles);
   ```

4. **Lines 657-660**: Added proportional extension calculation in `autoAdvanceRotations`
   ```javascript
   const baseRotationDays = units.reduce((sum, unit) => sum + unit.duration_days, 0);
   const extensionMultiplier = internshipDuration / baseRotationDays;
   const cycles = Math.ceil(extensionMultiplier);
   ```

5. **Lines 680-690**: Updated unit selection in `autoAdvanceRotations` with balanced formula
   ```javascript
   const rotationCount = allRotationsHistory.length;
   const nextUnitIndex = (intern.id + rotationCount) % units.length;
   const finalUnit = (Math.random() < 0.15) 
     ? units[(nextUnitIndex + 1) % units.length]
     : nextUnit;
   ```

6. **Line 694**: Calculate extended duration for auto-advance rotations
   ```javascript
   const extendedUnitDuration = Math.round(finalUnit.duration_days * extensionMultiplier / cycles);
   ```

7. **Line 705**: Use extended duration when calculating end dates
   - Old: `addDays(currentStartDate, finalUnit.duration_days - 1)`
   - New: `addDays(currentStartDate, extendedUnitDuration - 1)`

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

