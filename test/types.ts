import {
  createDynamicSandboxRuntime,
  createLocalSandboxRuntime,
  createSandboxSourceStore,
  defineSandboxModule,
  defineSandboxSourceModule,
  diffSandboxSourceModules,
  hydrateSandboxSourceModule,
  readSandboxSourceModuleAt,
  replaySandboxSourceEvents,
  type FrontierSandboxRuntime
} from '../dist/index.js';

const module = defineSandboxModule({
  manifest: {
    id: 'typed',
    actions: [
      {
        id: 'typed.set',
        reads: ['/value'],
        writes: ['/value']
      }
    ]
  },
  actions: {
    'typed.set'(ctx, input) {
      void input;
      return ctx.patch.set('/value', ctx.read('/value') ?? null);
    }
  }
});

const runtime: FrontierSandboxRuntime = createLocalSandboxRuntime(module);
void runtime.invoke('typed.set', { ok: true }, { state: { value: 'x' } });

const sourceModule = defineSandboxSourceModule({
  id: 'typed-source',
  actions: [
    {
      id: 'typed-source.set',
      reads: ['/value'],
      writes: ['/value'],
      format: 'function-body',
      source: 'return ctx.patch.set("/value", "ok");'
    }
  ]
});
const sourceStore = createSandboxSourceStore(sourceModule);
sourceStore.applySandboxSourceEvent({
  kind: 'frontier.sandbox.source.action.upsert',
  action: {
    id: 'typed-source.set',
    reads: ['/value'],
    writes: ['/value'],
    format: 'function-expression',
    source: '(ctx) => ctx.patch.set("/value", "ok")'
  }
});
const dynamicRuntime: FrontierSandboxRuntime = createDynamicSandboxRuntime({
  source: sourceStore,
  createRuntime() {
    return runtime;
  }
});
const sourceEvents = diffSandboxSourceModules(sourceModule, sourceStore.getSandboxSource());
const replayed = replaySandboxSourceEvents(sourceModule, sourceEvents);
const hydrated = hydrateSandboxSourceModule(replayed);
const fromState = readSandboxSourceModuleAt({ logic: hydrated }, '/logic');
void fromState.contentHash;
void replayed.contentHash;
void dynamicRuntime.invoke('typed-source.set');
