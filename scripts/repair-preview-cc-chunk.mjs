import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

const PREVIEW_ROOT = 'temp/programming/packer-driver/targets/preview';
const IMPORT_MAP_PATH = join(PREVIEW_ROOT, 'import-map.json');
const ASSEMBLY_RECORD_PATH = join(PREVIEW_ROOT, 'assembly-record.json');
const CC_SPECIFIER = 'cce:/internal/x/cc';

function readJson(path) {
  if (!existsSync(path)) {
    throw new Error(`missing ${path}`);
  }
  return JSON.parse(readFileSync(path, 'utf8'));
}

function normalizeChunkPath(chunkPath) {
  const normalized = String(chunkPath ?? '').replace(/\\/g, '/');
  return normalized.startsWith('./') ? normalized : `./${normalized.replace(/^\/+/, '')}`;
}

function extractSystemRegisterDependencies(chunk) {
  const match = String(chunk).match(/System\.register\(\s*\[([\s\S]*?)\]\s*,/);
  if (!match) {
    return [];
  }
  return Array.from(match[1].matchAll(/['"]([^'"]+)['"]/g)).map((item) => item[1]);
}

function renderCcAggregateChunk(dependencies, sourceMapFile) {
  const dependencyList = dependencies.map((dependency) => `"${dependency}"`).join(', ');
  const setters = dependencies.map((_, index) => {
    const suffix = index === 0 ? '' : String(index + 1);
    const unresolvedName = `_unresolved_${suffix}`;
    const exportObjName = `_exportObj${suffix}`;
    const keyName = `_key${suffix}`;
    return `function (${unresolvedName}) {
      var ${exportObjName} = {};

      for (var ${keyName} in ${unresolvedName}) {
        if (${keyName} !== "default" && ${keyName} !== "__esModule") ${exportObjName}[${keyName}] = ${unresolvedName}[${keyName}];
      }

      _export(${exportObjName});
    }`;
  }).join(', ');

  return `System.register([${dependencyList}], function (_export, _context) {
  "use strict";

  return {
    setters: [${setters}],
    execute: function () {}
  };
});
//# sourceMappingURL=${sourceMapFile}
`;
}

const importMap = readJson(IMPORT_MAP_PATH);
const assemblyRecord = readJson(ASSEMBLY_RECORD_PATH);
const ccChunkPath = normalizeChunkPath(importMap.imports?.[CC_SPECIFIER]);
if (!ccChunkPath || !ccChunkPath.startsWith('./chunks/')) {
  throw new Error(`${CC_SPECIFIER} import-map chunk not found`);
}

const ccChunkId = ccChunkPath.replace(/^\.\/chunks\/[a-f0-9]{2}\//, '').replace(/\.js$/, '');
const ccAssembly = assemblyRecord.chunks?.[ccChunkId];
if (!ccAssembly?.imports) {
  throw new Error(`${CC_SPECIFIER} assembly record not found for ${ccChunkId}`);
}

const expectedDependencies = Object.keys(ccAssembly.imports)
  .filter((dependency) => dependency.startsWith('__unresolved_'))
  .sort((a, b) => Number(a.split('_')[1]) - Number(b.split('_')[1]));

const chunkFile = join(PREVIEW_ROOT, ccChunkPath.replace(/^\.\//, ''));
const current = readFileSync(chunkFile, 'utf8');
const currentDependencies = extractSystemRegisterDependencies(current);
if (currentDependencies.join('|') === expectedDependencies.join('|')) {
  console.log(`preview cc chunk ok: ${expectedDependencies.length} dependencies`);
  process.exit(0);
}

const sourceMapFile = `${ccChunkId}.js.map`;
writeFileSync(chunkFile, renderCcAggregateChunk(expectedDependencies, sourceMapFile), 'utf8');
console.log(`repaired preview cc chunk: ${currentDependencies.length} -> ${expectedDependencies.length} dependencies (${dirname(chunkFile)})`);
