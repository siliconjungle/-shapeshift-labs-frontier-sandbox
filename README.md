# Frontier Sandbox

Small runtime contracts for Frontier-shaped sandboxed code.

This repository does not implement a package manager. It defines the execution contract that Frontier runtimes can share:

- actions declare reads, writes, and capabilities;
- actions return patch/effect/event/log intent instead of mutating host state directly;
- hosts validate returned patches before applying them;
- sandbox runtimes can be local, QuickJS-backed, worker-backed, or process-backed.

```ts
import {
  createLocalSandboxRuntime,
  defineSandboxModule
} from '@shapeshift-labs/frontier-sandbox';

const module = defineSandboxModule({
  manifest: {
    id: 'todos',
    version: '0.1.0',
    actions: [
      {
        id: 'todos.toggle',
        reads: ['/todos/:id/done'],
        writes: ['/todos/:id/done'],
        capabilities: ['audit.log']
      }
    ]
  },
  actions: {
    'todos.toggle'(ctx, input) {
      const id = String(input && typeof input === 'object' ? input.id : '');
      const path = `/todos/${id}/done`;
      const done = ctx.read(path);
      return [
        ctx.patch.replace(path, !done),
        ctx.effect('audit.log', { id })
      ];
    }
  }
});

const runtime = createLocalSandboxRuntime(module);
const result = await runtime.invoke('todos.toggle', { id: 'a' }, {
  state: { todos: { a: { done: false } } }
});

console.log(result.patches);
```

Use `@shapeshift-labs/frontier-sandbox-quickjs` when the code must run behind a real QuickJS/WebAssembly isolation boundary.

## Dynamic Source Modules

Sandbox actions can also be stored and synced as plain strings. This is the intended shape for CRDT documents, event-sourced code updates, game-authored behaviors, or other dynamic systems. Frontier does not require a synchronized AST.

```ts
import {
  createSandboxSourceStore,
  defineSandboxSourceModule,
  diffSandboxSourceModules,
  readSandboxSourceModuleAt,
  replaySandboxSourceEvents
} from '@shapeshift-labs/frontier-sandbox';

const source = defineSandboxSourceModule({
  id: 'world.behaviors',
  revision: 1,
  actions: [
    {
      id: 'npc.rename',
      reads: ['/npcs/:id/name'],
      writes: ['/npcs/:id/name'],
      format: 'function-body',
      source: `
        const path = '/npcs/' + input.id + '/name';
        return ctx.patch.replace(path, input.name);
      `
    }
  ]
});

const store = createSandboxSourceStore(source);

store.applySandboxSourceEvent({
  kind: 'frontier.sandbox.source.action.upsert',
  revision: 2,
  action: {
    id: 'npc.rename',
    reads: ['/npcs/:id/name'],
    writes: ['/npcs/:id/name'],
    format: 'function-expression',
    source: '(ctx, input) => ctx.patch.replace("/npcs/" + input.id + "/name", input.name)'
  }
});
```

The source module carries a stable `contentHash` and action-level hashes, so a runtime can rebuild only when the synced string changes. `createDynamicSandboxRuntime()` accepts a source provider plus a runtime factory, which lets QuickJS, workers, game VMs, or trusted local runtimes share the same dynamic source contract.

For event logs, produce compact source events from two snapshots and replay them in a batch:

```ts
const events = diffSandboxSourceModules(previousSource, nextSource);
const replayed = replaySandboxSourceEvents(previousSource, events);
```

For game state, CRDT snapshots, or other JSON-shaped stores, hydrate a source module from a path:

```ts
const source = readSandboxSourceModuleAt(worldState, '/systems/npcLogic');
```

Run focused benchmarks with:

```sh
npm run bench
```
