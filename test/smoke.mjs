import assert from 'node:assert';
import { applyPatchImmutable } from '@shapeshift-labs/frontier';
import {
  assertSandboxSource,
  createDynamicSandboxRuntime,
  createFrontierSandboxActionRegistry,
  createLocalSandboxRuntime,
  createSandboxSourceStore,
  defineSandboxModule,
  defineSandboxSourceModule,
  diffSandboxSourceModules,
  getSandboxActionSource,
  hydrateSandboxSourceModule,
  readSandboxSourceModuleAt,
  replaySandboxSourceEvents,
  scanSandboxSource
} from '../dist/index.js';

const module = defineSandboxModule({
  manifest: {
    id: 'todos',
    version: '0.1.0',
    capabilities: ['module.audit'],
    actions: [
      {
        id: 'todos.toggle',
        reads: ['/todos/:id/done'],
        writes: ['/todos/:id/done'],
        capabilities: ['audit.log']
      },
      {
        id: 'todos.badWrite',
        reads: ['/todos/:id/done'],
        writes: ['/todos/:id/done']
      }
    ]
  },
  actions: {
    'todos.toggle'(ctx, input) {
      const id = String(input.id);
      const path = `/todos/${id}/done`;
      const done = ctx.read(path);
      return [
        ctx.patch.replace(path, !done),
        ctx.effect('audit.log', { id }),
        ctx.effect('module.audit', { id }),
        ctx.event('todos.toggled', { id }),
        ctx.log('info', 'toggled todo', { id })
      ];
    },
    'todos.badWrite'(ctx, input) {
      return ctx.patch.replace(`/todos/${String(input.id)}/text`, 'bad');
    }
  }
});

const runtime = createLocalSandboxRuntime(module);
const result = await runtime.invoke('todos.toggle', { id: 'a' }, {
  state: { todos: { a: { done: false } } }
});

assert.deepStrictEqual(result.patches, [[0, ['todos', 'a', 'done'], true]]);
assert.strictEqual(result.effects[0].capability, 'audit.log');
assert.strictEqual(result.effects[1].capability, 'module.audit');
assert.strictEqual(result.events[0].type, 'todos.toggled');
assert.strictEqual(result.logs[0].level, 'info');

await assert.rejects(
  runtime.invoke('todos.badWrite', { id: 'a' }, { state: { todos: { a: { done: false, text: 'Alpha' } } } }),
  /undeclared path/
);

assert.deepStrictEqual(scanSandboxSource('fetch("/x")').map((diagnostic) => diagnostic.code), ['frontier.sandbox.ambient-network']);
assert.doesNotThrow(() => assertSandboxSource('ctx.effect("http.request", {})'));

let state = { todos: { a: { done: false } } };
const registry = createFrontierSandboxActionRegistry({
  runtime,
  source: {
    get: () => state,
    commitPatch(patch) {
      state = applyPatchImmutable(state, patch);
      return state;
    }
  }
});

await registry.dispatch('todos.toggle', { id: 'a' });
assert.strictEqual(state.todos.a.done, true);
assert.strictEqual(registry.history().length, 1);

const sourceModule = defineSandboxSourceModule({
  id: 'dynamic.todos',
  revision: 1,
  actions: [
    {
      id: 'dynamic.rename',
      reads: ['/user/name'],
      writes: ['/user/name'],
      format: 'function-body',
      source: 'return ctx.patch.replace("/user/name", "Source v1");',
      revision: 1
    }
  ]
});
assert.ok(sourceModule.contentHash.startsWith('fnv1a32:'));
assert.strictEqual(sourceModule.actions[0].contentHash.startsWith('fnv1a32:'), true);
assert.throws(
  () => defineSandboxSourceModule({
    id: 'bad.hash',
    actions: [
      {
        id: 'bad.hash.action',
        reads: ['/value'],
        writes: ['/value'],
        source: 'return null;',
        contentHash: 'fnv1a32:00000000'
      }
    ]
  }),
  /hash mismatch/
);

const sourceStore = createSandboxSourceStore(sourceModule);
const seenSourceHashes = [];
sourceStore.subscribeSandboxSource((next) => {
  seenSourceHashes.push(next.contentHash);
});
sourceStore.applySandboxSourceEvent({
  kind: 'frontier.sandbox.source.action.upsert',
  revision: 2,
  action: {
    id: 'dynamic.rename',
    reads: ['/user/name'],
    writes: ['/user/name'],
    format: 'function-body',
    source: 'return ctx.patch.replace("/user/name", "Source v2");',
    revision: 2
  }
});
assert.strictEqual(seenSourceHashes.length, 1);
assert.notStrictEqual(sourceStore.getSandboxSource().contentHash, sourceModule.contentHash);
assert.strictEqual(getSandboxActionSource(sourceStore.getSandboxSource(), 'dynamic.rename').revision, 2);
assert.strictEqual(hydrateSandboxSourceModule(sourceStore.getSandboxSource()).contentHash, sourceStore.getSandboxSource().contentHash);
assert.strictEqual(
  readSandboxSourceModuleAt({ game: { logic: sourceStore.getSandboxSource() } }, '/game/logic').contentHash,
  sourceStore.getSandboxSource().contentHash
);

const diffEvents = diffSandboxSourceModules(sourceModule, sourceStore.getSandboxSource());
assert.deepStrictEqual(diffEvents.map((event) => event.kind), ['frontier.sandbox.source.action.upsert']);
assert.deepStrictEqual(
  replaySandboxSourceEvents(sourceModule, diffEvents).contentHash,
  sourceStore.getSandboxSource().contentHash
);

const builtHashes = [];
const dynamicRuntime = createDynamicSandboxRuntime({
  source: sourceStore,
  createRuntime(source) {
    builtHashes.push(source.contentHash);
    return {
      invoke(actionId) {
        return {
          patches: [[0, ['lastBuild'], source.contentHash]],
          events: [{ kind: 'frontier.sandbox.event', type: actionId }],
          effects: [],
          logs: []
        };
      }
    };
  }
});
const dynamicResult = await dynamicRuntime.invoke('dynamic.rename');
assert.strictEqual(dynamicResult.patches[0][2], sourceStore.getSandboxSource().contentHash);
assert.deepStrictEqual(builtHashes, [sourceStore.getSandboxSource().contentHash]);

console.log('frontier sandbox smoke passed');
