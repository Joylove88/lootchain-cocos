import { execSync } from 'node:child_process';
// Stage 13I 当前聚合守卫：历史阶段脚本保留用于追溯，但不再强制旧中心收敛/旧缩放数值。
const guards = ['check-battle-stage13a', 'check-battle-stage13b', 'check-battle-stage13c', 'check-battle-stage13d', 'check-battle-stage13e', 'check-battle-stage13f', 'check-battle-stage13g', 'check-battle-stage13h', 'check-battle-stage13k', 'check-battle-stage13o', 'check-battle-stage13q', 'check-battle-stage13r', 'check-battle-stage13v', 'check-battle-stage13w', 'check-battle-stage13x', 'check-battle-stage13y', 'check-battle-stage13z', 'check-battle-stage13z2', 'check-battle-stage13z3', 'check-battle-phase-a-impact', 'check-battle-stage14-real-combat', 'check-battle-visual-state-machine'];
let ok = true;
for (const g of guards) {
  try {
    const out = execSync('node ./scripts/' + g + '.mjs', { encoding: 'utf8' });
    console.log(out.trim());
  } catch (e) {
    console.error('FAILED: ' + g);
    ok = false;
  }
}
try {
  execSync('node ./scripts/check-layout.mjs', { encoding: 'utf8', stdio: 'inherit' });
} catch (e) {
  console.error('FAILED: check:layout');
  ok = false;
}
if (!ok) process.exit(1);
console.log('battle-stage13i ok (aggregate)');
