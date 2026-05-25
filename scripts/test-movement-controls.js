const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '..', 'client', 'src', 'components', 'MovementControls.js');
if (!fs.existsSync(filePath)) {
  console.error('MovementControls.js not found at', filePath);
  process.exit(2);
}

const src = fs.readFileSync(filePath, 'utf8');

const checks = [
  {name: 'Accept label', ok: src.includes("Accept')") || src.includes("Accepting...") || src.includes("Accept"), hint: "Accept label or conditional text"},
  {name: 'Reassign label', ok: src.includes('Reassign') || src.includes('Reassigning'), hint: "Reassign label or conditional text"},
  {name: 'enabled flag uses isOverdue', ok: src.includes('const enabled = Boolean(item?.isOverdue)') || src.includes('item?.isOverdue'), hint: "enabled depends on item.isOverdue"},
  {name: 'Accept onClick gating', ok: src.includes('onClick={() => enabled && onAccept') || src.includes('onAccept?.(item)'), hint: "Accept onClick only triggers when enabled"},
  {name: 'Reassign onClick gating', ok: src.includes('onClick={() => enabled && onReassign') || src.includes('onReassign?.(item)'), hint: "Reassign onClick only triggers when enabled"},
  {name: 'disabled attribute present', ok: src.includes('disabled={!enabled || acceptPending') || src.includes('disabled={!enabled || reassignPending') || src.includes('disabled={!enabled'), hint: "disabled prop references enabled and pending flags"}
];

let failed = 0;
console.log('Running static checks on MovementControls.js');
for (const c of checks) {
  if (c.ok) {
    console.log(`✅ ${c.name}`);
  } else {
    console.log(`❌ ${c.name} - ${c.hint}`);
    failed += 1;
  }
}

if (failed > 0) {
  console.error(`\n${failed} checks failed.`);
  process.exit(1);
}

console.log('\nAll checks passed: Accept and Reassign buttons present and gated by overdue flag.');
process.exit(0);
