// 守卫战服务端复演命令行(docs/43)。stdin:{ start: 开战回执 JSON, replay: {v, inputs} | 其 JSON 字符串, allowChestScript: bool }
// stdout(一行 JSON):{ ok, reason?, win, phase, wave, trialLayers, timeMs, crystalHp, killCount, skippedInputs, inputs }
import { GUARD_REPLAY_VERSION, guardReplayBattle, guardReplaySetupFromStart } from './GuardReplay.mjs';

function readStdin() {
  return new Promise((resolve, reject) => {
    const chunks = [];
    process.stdin.on('data', (chunk) => chunks.push(chunk));
    process.stdin.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    process.stdin.on('error', reject);
  });
}

function emit(obj) {
  process.stdout.write(JSON.stringify(obj) + '\n');
}

try {
  const payload = JSON.parse(await readStdin());
  const replay = typeof payload.replay === 'string' ? JSON.parse(payload.replay) : payload.replay;
  if (!replay || !Array.isArray(replay.inputs)) {
    emit({ ok: false, reason: 'NO_INPUTS' });
  } else if (Number(replay.v) !== GUARD_REPLAY_VERSION) {
    emit({ ok: false, reason: 'VERSION_MISMATCH', clientVersion: replay.v, serverVersion: GUARD_REPLAY_VERSION });
  } else {
    const setup = guardReplaySetupFromStart(payload.start, payload.allowChestScript === true);
    if (!setup) {
      emit({ ok: false, reason: 'NO_SETUP' });
    } else {
      const inputs = replay.inputs.slice(0, 20000);
      const result = guardReplayBattle(setup, inputs);
      emit({ ok: true, ...result, inputs: inputs.length });
    }
  }
} catch (error) {
  emit({ ok: false, reason: 'ERROR', message: String(error && error.message ? error.message : error).slice(0, 300) });
}
