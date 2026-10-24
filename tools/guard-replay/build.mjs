// 守卫战服务端复演产物构建(docs/43):把客户端同一份纯逻辑 TS(模型 / 词条 / 技能表 / 战斗属性 / 复演)转成 .mjs,
// 连同 cli.mjs 一起输出到后端仓 guard-replay/,由 Java 结算时用 node 调用。模型有改动就要重跑本脚本并提交后端仓。
// 用法:npm run build:guard-replay   (默认输出 ../LootChain/guard-replay)
import { createRequire } from 'module';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const require = createRequire(import.meta.url);
const ts = require('D:/office app/cocos/editors/Creator/3.8.8/resources/app.asar.unpacked/node_modules/typescript/lib/typescript.js');
const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, '..', '..');
const out = path.resolve(process.argv[2] || path.join(repo, '..', 'LootChain', 'guard-replay'));
const srcDir = path.join(repo, 'assets', 'scripts', 'scenes', 'lobby');
const modules = ['GuardBattleModel', 'GuardPerkConfig', 'LobbyBattleHeroSkillConfig', 'HeroCombatStats', 'GuardReplay'];

fs.mkdirSync(out, { recursive: true });
const hash = crypto.createHash('sha256');
for (const name of modules) {
  const src = fs.readFileSync(path.join(srcDir, `${name}.ts`), 'utf8');
  hash.update(src);
  const js = ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 } }).outputText
    .replace(new RegExp(`from '\\./(${modules.join('|')})'`, 'g'), "from './$1.mjs'");
  fs.writeFileSync(path.join(out, `${name}.mjs`), js);
}
fs.copyFileSync(path.join(here, 'cli.mjs'), path.join(out, 'cli.mjs'));
const digest = hash.digest('hex').slice(0, 16);
fs.writeFileSync(path.join(out, 'BUILD_INFO.json'), JSON.stringify({ sourceHash: digest, modules }, null, 2) + '\n');
console.log('guard-replay built ->', out, 'sourceHash', digest);
