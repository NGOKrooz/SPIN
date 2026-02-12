const db = require('../server/database/dbWrapper');
const { addDays, format } = require('date-fns');

function normalizeName(n) {
  if (!n) return '';
  return String(n).toLowerCase().replace(/[^a-z0-9]/g, '');
}

const APPROVED_UNITS = [
  'Exercise Immunology',
  'Intensive Care Unit',
  "Pelvic and Women's Health",
  'Neurosurgery',
  'Adult Neurology',
  'Medicine and Acute Care',
  'Geriatric and Mental Health',
  'Electrophysiology',
  'Orthopedic Out-Patient',
  'Orthopedic In-Patient',
  'Pediatric-In',
  'Pediatric-Out (NDT)'
];

function run(query, params=[]) {
  return new Promise((resolve, reject) => db.run(query, params, (err) => err ? reject(err) : resolve()));
}

function all(query, params=[]) {
  return new Promise((resolve, reject) => db.all(query, params, (err, rows) => err ? reject(err) : resolve(rows || [])));
}

(async function main(){
  console.log('Running schedule cleanup script...');
  try {
    const report = { renamedUnits: [], updatedRotations: 0, deletedRotations: 0, errors: [] };
    const units = await all('SELECT id, name, duration_days, workload FROM units');
    const approvedMap = {};
    APPROVED_UNITS.forEach(n => approvedMap[normalizeName(n)] = n);

    for (const u of units) {
      const norm = normalizeName(u.name);
      if (approvedMap[norm] && u.name !== approvedMap[norm]) {
        await run('UPDATE units SET name = ? WHERE id = ?', [approvedMap[norm], u.id]);
        report.renamedUnits.push({ id: u.id, from: u.name, to: approvedMap[norm] });
      }
    }

    const refreshedUnits = await all('SELECT id, name, duration_days, workload FROM units');
    const unitById = {};
    refreshedUnits.forEach(u => unitById[u.id] = u);

    const rotations = await all('SELECT * FROM rotations');
    for (const r of rotations) {
      try {
        if (!r.id || !r.intern_id || !r.unit_id) {
          await run('DELETE FROM rotations WHERE id = ?', [r.id]);
          report.deletedRotations++;
          continue;
        }
        const unit = unitById[r.unit_id];
        if (!unit || !APPROVED_UNITS.includes(unit.name)) {
          await run('DELETE FROM rotations WHERE id = ?', [r.id]);
          report.deletedRotations++;
          continue;
        }

        const start = new Date(r.start_date);
        const end = new Date(r.end_date);
        if (isNaN(start.getTime()) || isNaN(end.getTime())) {
          await run('DELETE FROM rotations WHERE id = ?', [r.id]);
          report.deletedRotations++;
          continue;
        }

        const startStr = format(start, 'yyyy-MM-dd');
        const endStr = format(end, 'yyyy-MM-dd');

        const isManual = r.is_manual_assignment ? true : false;
        const expectedEnd = addDays(start, Math.max(1, (unit.duration_days || 1)) - 1);
        const expectedEndStr = format(expectedEnd, 'yyyy-MM-dd');
        if (!isManual && endStr !== expectedEndStr) {
          await run('UPDATE rotations SET start_date = ?, end_date = ? WHERE id = ?', [startStr, expectedEndStr, r.id]);
          report.updatedRotations++;
        } else if (r.start_date !== startStr || r.end_date !== endStr) {
          await run('UPDATE rotations SET start_date = ?, end_date = ? WHERE id = ?', [startStr, endStr, r.id]);
          report.updatedRotations++;
        }
      } catch (err) {
        report.errors.push({ id: r.id, error: String(err) });
      }
    }

    console.log('Cleanup report:', JSON.stringify(report, null, 2));
  } catch (err) {
    console.error('Cleanup script error:', err);
  }
})();
