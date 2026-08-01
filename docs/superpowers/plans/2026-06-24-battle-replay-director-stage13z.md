# Battle Replay Director Stage13Z Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace ad-hoc battle movement/HP inference with a deterministic replay model so actors attack the current target instead of empty space, and HP bars change exactly from hit events.

**Architecture:** Add a pure `LobbyBattleReplayModel` that converts the existing read-only battle presentation timeline into ordered `BattleReplayAction` records. Existing renderers continue to draw the scene, but action cues and HP state are derived from replay actions and `BattleReplayHitEvent.hpBefore/hpAfter`, not scattered timeline guesses. The first slice deliberately avoids backend protocol changes and keeps battle settlement untouched.

**Tech Stack:** Cocos Creator 3.8.8 TypeScript modules, existing Node-based static guard scripts, existing Playwright screenshot harness.

---

### Task 1: Stage13Z Guard

**Files:**
- Create: `scripts/check-battle-stage13z.mjs`
- Modify: `package.json`
- Modify: `scripts/check-battle-stage13i.mjs`

- [ ] **Step 1: Write failing guard**

Guard assertions:
- `LobbyBattleReplayModel.ts` exists.
- `BattleReplayHitEvent` includes `hpBefore` and `hpAfter`.
- `resolveBattleReplay()` exists and consumes `BattlePresentationSnapshot` + `BattlePresentationTimeline`.
- `LobbyBattleActionPresentation.ts` imports and uses `resolveBattleReplay`.
- `LobbyBattlePresentationHp.ts` imports and uses `resolveBattleReplay`.
- `LobbyBattlePreviewPanelRenderer.ts` contains `BATTLE_ENABLE_IDLE_CLASH_COMBAT = false`.

- [ ] **Step 2: Run guard to verify it fails**

Run: `npm.cmd run check:battle-stage13z`

Expected: FAIL because `LobbyBattleReplayModel.ts` does not exist yet.

### Task 2: Replay Model

**Files:**
- Create: `assets/scripts/scenes/lobby/LobbyBattleReplayModel.ts`
- Test: `scripts/check-battle-stage13z.mjs`

- [ ] **Step 1: Implement replay types**

Add:
- `BattleReplayUnitState`
- `BattleReplayHitEvent`
- `BattleReplayAction`
- `BattleReplay`

- [ ] **Step 2: Implement `resolveBattleReplay(snapshot, timeline)`**

Rules:
- Ignore empty/dead units.
- Pair each `action_start` with the next same actor/target `damage_preview`.
- If no damage exists, keep action but with empty `hitEvents`.
- Build target HP by applying each hit event in order.
- Drop actions whose actor or target is already dead before the action starts.
- `movementKind` is `approach` for front/boss melee and `stay` for back-line ranged.

### Task 3: Replay-Driven Action Cues

**Files:**
- Modify: `assets/scripts/scenes/lobby/LobbyBattleActionPresentation.ts`

- [ ] **Step 1: Route `resolveBattleActionPresentationCues()` through replay**

Generate:
- `melee_move` and `basic_attack` from a melee action.
- `ranged_projectile` from a ranged/stay action.
- `damage_float` from each `BattleReplayHitEvent`.
- `hit_float` shortly after each `BattleReplayHitEvent`.

### Task 4: Replay-Driven HP

**Files:**
- Modify: `assets/scripts/scenes/lobby/LobbyBattlePresentationHp.ts`

- [ ] **Step 1: Route HP state through replay**

Apply only `BattleReplayHitEvent` records whose `timeMs <= playbackTimelineTimeMs`.
Set `currentHp = hit.hpAfter`, not `currentHp -= parsedDamage`.

### Task 5: Stop Idle Air Attacks

**Files:**
- Modify: `assets/scripts/scenes/lobby/LobbyBattlePreviewPanelRenderer.ts`

- [ ] **Step 1: Add explicit idle clash gate**

Add `const BATTLE_ENABLE_IDLE_CLASH_COMBAT = false`.

- [ ] **Step 2: Guard the old ambient clash block**

Wrap the non-current-unit clash animation loop with the flag so only replay/current-action actor/target plays attack/hit animations.

### Task 6: Verification

**Files:**
- Modify: `docs/current-chat-context.md`

- [ ] **Step 1: Run static guards**

Run:
- `npm.cmd run check:battle-stage13z`
- `npm.cmd run check:battle-stage13i`
- `npm.cmd run check:layout`
- `npm.cmd run check:preview`

- [ ] **Step 2: Run visual acceptance**

Run: `npm.cmd run screenshot:battle-center`

Expected:
- 1 battle start request.
- 0 settle requests.
- 0 page errors.
- 0 console errors.
- HP samples show enemy and ally HP decreasing.
- Dead unit hit samples remain 0.

- [ ] **Step 3: Update handoff doc**

Append Stage13Z summary to `docs/current-chat-context.md`, including boundary unchanged.
