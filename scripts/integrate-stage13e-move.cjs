const fs = require('fs');
const p = 'assets/scripts/scenes/lobby/LobbyBattlePreviewPanelRenderer.ts';
let t = fs.readFileSync(p, 'utf8');

// 修改 renderActor：1) 初始位置用 base（不加 offset），2) 添加移动 tween
const oldCode = `    const actionOffset = this.resolveActorActionOffset(unit, enemy, slot, currentActionCue, presentation);
    const actor = this.host.addChildPlainNode(parent, \`LobbyBattleActor_\${enemy ? 'Enemy' : 'Ally'}_\${sourceIndex}\`, slot.x + actionOffset.x, slot.y + actionOffset.y, slot.width, slot.height);`;

const newCode = `    const actionOffset = this.resolveActorActionOffset(unit, enemy, slot, currentActionCue, presentation);
    // Stage 13E：初始位置用 base（不加 offset），由 tween 驱动实际移动动画
    const actor = this.host.addChildPlainNode(parent, \`LobbyBattleActor_\${enemy ? 'Enemy' : 'Ally'}_\${sourceIndex}\`, slot.x, slot.y, slot.width, slot.height);`;

if (!t.includes(oldCode)) { console.log('actor position code not found'); process.exit(1); }
t = t.replace(oldCode, newCode);

// 在 active tween 之前添加移动 tween
const oldTween = `    if (active) {
      // Stage 6 只做本地动作表现，不改变战斗结算。
      tween(actor)
        .repeatForever(tween().to(0.32, { scale: new Vec3(targetActive ? 0.99 : 1.026, targetActive ? 1.01 : 1.026, 1) }).to(0.34, { scale: Vec3.ONE }).delay(0.42))
      .start();
    }`;

const newTween = `    // Stage 13E：行动单位移动 tween（英雄向右、怪物向左突进后返回）
    if (actorActive && currentActionCue && (currentActionCue.kind === 'melee_move' || currentActionCue.kind === 'basic_attack') && (presentation.phase === 'roundPlaying' || presentation.phase === 'resultRecording')) {
      const moveDir = enemy ? -1 : 1;
      const moveDist = moveDir * slot.width * Math.max(0.3, currentActionCue.advanceRatio);
      tween(actor)
        .to(0.25, { position: new Vec3(slot.x + moveDist, slot.y + actionOffset.y, 0) }, { easing: 'quadOut' })
        .delay(0.15)
        .to(0.3, { position: new Vec3(slot.x, slot.y, 0) }, { easing: 'quadIn' })
        .start();
    } else if (actorActive && currentActionCue && currentActionCue.kind === 'ranged_projectile' && (presentation.phase === 'roundPlaying' || presentation.phase === 'resultRecording')) {
      const moveDir = enemy ? -1 : 1;
      const moveDist = moveDir * slot.width * 0.08;
      tween(actor)
        .to(0.2, { position: new Vec3(slot.x + moveDist, slot.y + actionOffset.y, 0) })
        .to(0.2, { position: new Vec3(slot.x, slot.y, 0) })
        .start();
    }
    if (active) {
      // Stage 6 只做本地动作表现，不改变战斗结算。
      tween(actor)
        .repeatForever(tween().to(0.32, { scale: new Vec3(targetActive ? 0.99 : 1.026, targetActive ? 1.01 : 1.026, 1) }).to(0.34, { scale: Vec3.ONE }).delay(0.42))
      .start();
    }`;

if (!t.includes(oldTween)) { console.log('tween code not found'); process.exit(1); }
t = t.replace(oldTween, newTween);

fs.writeFileSync(p, t);
console.log('movement tween integration done, len=' + t.length);