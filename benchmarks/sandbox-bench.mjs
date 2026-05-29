import fs from 'node:fs';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import {
  createLocalSandboxRuntime,
  defineSandboxModule,
  defineSandboxSourceModule,
  diffSandboxSourceModules,
  replaySandboxSourceEvents
} from '../dist/index.js';

const outPath = readOutPath(process.argv);
const rows = [];

const actionCount = 64;
const source = defineSandboxSourceModule({
  id: 'bench.source',
  revision: 1,
  actions: Array.from({ length: actionCount }, (_, index) => ({
    id: 'bench.action.' + index,
    reads: ['/rows/:id/value'],
    writes: ['/rows/:id/value'],
    format: 'function-body',
    source: 'return ctx.patch.replace("/rows/" + input.id + "/value", input.value);',
    revision: 1
  }))
});

const next = defineSandboxSourceModule({
  id: 'bench.source',
  revision: 2,
  actions: source.actions.map((action, index) => {
    if (index % 8 !== 0) return action;
    return {
      id: action.id,
      reads: action.reads,
      writes: action.writes,
      format: action.format,
      source: 'return ctx.patch.replace("/rows/" + input.id + "/value", input.value + ' + index + ');',
      revision: 2
    };
  })
});

const module = defineSandboxModule({
  manifest: {
    id: 'bench.local',
    actions: [{ id: 'bench.local.set', reads: ['/rows/:id/value'], writes: ['/rows/:id/value'] }]
  },
  actions: {
    'bench.local.set'(ctx, input) {
      return ctx.patch.replace('/rows/' + input.id + '/value', input.value);
    }
  }
});
const runtime = createLocalSandboxRuntime(module);
const state = { rows: { a: { value: 1 } } };

rows.push(measureSync('source.diff.64-actions', 5000, () => {
  diffSandboxSourceModules(source, next);
}));

const events = diffSandboxSourceModules(source, next);
rows.push(measureSync('source.replay.8-upserts', 2000, () => {
  replaySandboxSourceEvents(source, events);
}));

rows.push(await measureAsync('local.invoke.patch', 20000, async () => {
  await runtime.invoke('bench.local.set', { id: 'a', value: 2 }, { state });
}));

const result = {
  kind: 'frontier.sandbox.benchmark',
  version: 1,
  generatedAt: new Date().toISOString(),
  node: process.version,
  rows
};

if (outPath) {
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(result, null, 2) + '\n');
}

for (const row of rows) {
  console.log(`${row.name}: ${row.usPerOp.toFixed(2)}us/op iterations=${row.iterations}`);
}

function measureSync(name, iterations, fn) {
  for (let i = 0; i < Math.min(100, iterations); i++) fn();
  const start = performance.now();
  for (let i = 0; i < iterations; i++) fn();
  const totalMs = performance.now() - start;
  return row(name, iterations, totalMs);
}

async function measureAsync(name, iterations, fn) {
  for (let i = 0; i < Math.min(100, iterations); i++) await fn();
  const start = performance.now();
  for (let i = 0; i < iterations; i++) await fn();
  const totalMs = performance.now() - start;
  return row(name, iterations, totalMs);
}

function row(name, iterations, totalMs) {
  return {
    name,
    iterations,
    totalMs,
    usPerOp: (totalMs * 1000) / iterations
  };
}

function readOutPath(argv) {
  const index = argv.indexOf('--out');
  return index === -1 ? '' : argv[index + 1] || '';
}
