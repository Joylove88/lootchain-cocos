// 正式包 Babel loose 陷阱检查(docs/31):Creator 正式构建把 `[...x]` 编译成 `[].concat(x)`,
// 对 Map/Set/迭代器/字符串展开会变成"只含一个元素的数组"——预览正常、正式包出错。
// 本脚本用类型检查器找出所有"被展开的不是数组"的位置,发现即退出码 1。改法一律 Array.from(x)。
// 用法:node scripts/check-loose-spread.cjs(需要 Creator 自带的 TypeScript 与 temp/declarations,编辑器打开过工程即有)。
const path = require('path');
const fs = require('fs');

const ROOT = path.resolve(__dirname, '..');
const CREATOR_DIR = process.env.COCOS_CREATOR_DIR || 'D:/office app/cocos/editors/Creator/3.8.8';
const ts = require(path.join(CREATOR_DIR, 'resources/app.asar.unpacked/node_modules/typescript'));

const declDir = path.join(ROOT, 'temp/declarations');
if (!fs.existsSync(declDir)) {
  console.error(`[loose-spread] 缺少 ${declDir}(用 Creator 打开一次工程即可生成)`);
  process.exit(2);
}

const parsed = ts.parseJsonConfigFileContent(
  {
    compilerOptions: {
      target: 'ES2019', module: 'ESNext', moduleResolution: 'Node', experimentalDecorators: true,
      allowSyntheticDefaultImports: true, strict: true, skipLibCheck: true, noImplicitAny: false, noEmit: true,
      baseUrl: ROOT,
      types: ['cc.custom-macro', 'jsb', 'cc', 'cc.env'].map((name) => path.join(declDir, name)),
      paths: { 'db://assets/*': [path.join(ROOT, 'assets/*')] },
    },
    include: [path.join(ROOT, 'assets/**/*.ts')],
  },
  ts.sys,
  ROOT,
);
const program = ts.createProgram(parsed.fileNames, parsed.options);
const checker = program.getTypeChecker();

function isArrayLike(type) {
  if (type.isUnion()) {
    return type.types.every(isArrayLike);
  }
  if (checker.isArrayType(type) || checker.isTupleType(type)) {
    return true;
  }
  const name = type.getSymbol() && type.getSymbol().getName();
  return name === 'Array' || name === 'ReadonlyArray';
}

const findings = [];
for (const sf of program.getSourceFiles()) {
  const file = sf.fileName.replace(/\\/g, '/');
  if (!file.includes('/assets/') || file.endsWith('.d.ts')) {
    continue;
  }
  const visit = (node) => {
    // 只有数组字面量/调用实参里的展开会被 loose 改写;对象展开 {...x} 不受影响。
    if (ts.isSpreadElement(node)) {
      const type = checker.getTypeAtLocation(node.expression);
      if (!isArrayLike(type)) {
        const { line } = sf.getLineAndCharacterOfPosition(node.getStart());
        findings.push(`${file.split('/assets/')[1]}:${line + 1}  ${checker.typeToString(type).slice(0, 60)}  ${node.getText().slice(0, 80)}`);
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
}

if (findings.length > 0) {
  console.error(`[loose-spread] 发现 ${findings.length} 处非数组展开,正式包会出错,请改成 Array.from(...):`);
  findings.forEach((line) => console.error(`  assets/${line}`));
  process.exit(1);
}
console.log('[loose-spread] OK,没有非数组展开');
