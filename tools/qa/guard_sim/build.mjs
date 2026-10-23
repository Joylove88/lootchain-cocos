// 守卫战纯逻辑 sim 离线构建:把 GuardBattleModel.ts + GuardPerkConfig.ts 转成 .mjs,供 node 跑平衡回归。
// 用法:node tools/qa/guard_sim/build.mjs <输出目录> [源目录(默认 assets/scripts/scenes/lobby)]
//   基线对照:git show HEAD:assets/scripts/scenes/lobby/GuardBattleModel.ts > <dir>/GuardBattleModel.ts(PerkConfig 同理)再指定源目录。
import { createRequire } from 'module';
import fs from 'fs';
import path from 'path';

const require = createRequire(import.meta.url);
const ts = require('D:/office app/cocos/editors/Creator/3.8.8/resources/app.asar.unpacked/node_modules/typescript/lib/typescript.js');
const out = process.argv[2];
const srcDir = process.argv[3] || 'assets/scripts/scenes/lobby';
if (!out) {
  console.error('usage: node build.mjs <outDir> [srcDir]');
  process.exit(1);
}
fs.mkdirSync(out, { recursive: true });
for (const name of ['GuardBattleModel', 'GuardPerkConfig']) {
  const src = fs.readFileSync(path.join(srcDir, `${name}.ts`), 'utf8');
  const js = ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 } }).outputText
    .replace(/from '\.\/(GuardBattleModel|GuardPerkConfig)'/g, "from './$1.mjs'");
  fs.writeFileSync(path.join(out, `${name}.mjs`), js);
}
console.log('built', out);
