import {
  OP_APPEND,
  OP_ASSIGN,
  OP_REMOVE,
  OP_SET,
  OP_TRUNCATE
} from '@shapeshift-labs/frontier/constants';
import { assertPatch } from '@shapeshift-labs/frontier/patch';
import { assertJsonValue } from '@shapeshift-labs/frontier/validate';
import { parsePointer, stringifyPointer } from '@shapeshift-labs/frontier/pointer';
import type { JsonObject, JsonPath, JsonValue, Patch, PatchOperation, PathSegment } from '@shapeshift-labs/frontier';

export type FrontierSandboxPath = string | JsonPath;
export type FrontierSandboxMaybePromise<T> = T | PromiseLike<T>;
export type FrontierSandboxSourceRevision = string | number;
export type FrontierSandboxActionSourceFormat = 'function-body' | 'function-expression' | 'expression';

export interface FrontierSandboxActionManifest {
  id: string;
  version?: string;
  reads?: readonly FrontierSandboxPath[];
  writes?: readonly FrontierSandboxPath[];
  capabilities?: readonly string[];
  metadata?: Record<string, JsonValue>;
}

export interface FrontierSandboxModuleManifest {
  id: string;
  version?: string;
  actions: readonly FrontierSandboxActionManifest[];
  capabilities?: readonly string[];
  metadata?: Record<string, JsonValue>;
}

export interface FrontierSandboxModule {
  manifest: FrontierSandboxModuleManifest;
  actions: Record<string, FrontierSandboxActionHandler>;
}

export interface FrontierSandboxActionSource extends FrontierSandboxActionManifest {
  source: string;
  format?: FrontierSandboxActionSourceFormat;
  language?: 'javascript' | 'typescript' | string;
  revision?: FrontierSandboxSourceRevision;
  contentHash?: string;
  sourcePolicy?: FrontierSandboxSourcePolicy;
}

export interface FrontierSandboxSourceModule {
  kind: 'frontier.sandbox.source.module';
  schemaVersion: 1;
  id: string;
  version?: string;
  revision?: FrontierSandboxSourceRevision;
  manifest: FrontierSandboxModuleManifest;
  actions: readonly FrontierSandboxActionSource[];
  capabilities?: readonly string[];
  metadata?: Record<string, JsonValue>;
  contentHash: string;
}

export interface FrontierSandboxSourceModuleInput {
  id: string;
  version?: string;
  revision?: FrontierSandboxSourceRevision;
  actions: readonly FrontierSandboxActionSource[];
  capabilities?: readonly string[];
  metadata?: Record<string, JsonValue>;
  manifest?: FrontierSandboxModuleManifest;
  contentHash?: string;
  sourcePolicy?: FrontierSandboxSourcePolicy;
}

export type FrontierSandboxSourceEvent =
  | {
      kind: 'frontier.sandbox.source.action.upsert';
      action: FrontierSandboxActionSource;
      revision?: FrontierSandboxSourceRevision;
      metadata?: Record<string, JsonValue>;
    }
  | {
      kind: 'frontier.sandbox.source.action.remove';
      actionId: string;
      revision?: FrontierSandboxSourceRevision;
      metadata?: Record<string, JsonValue>;
    };

export interface FrontierSandboxSourceSubscription {
  readonly active: boolean;
  unsubscribe(): void;
}

export interface FrontierSandboxSourceProvider {
  getSandboxSource(): FrontierSandboxSourceModule;
  subscribeSandboxSource?(callback: (source: FrontierSandboxSourceModule, event?: FrontierSandboxSourceEvent) => void): FrontierSandboxSourceSubscription;
}

export interface FrontierSandboxSourceStore extends FrontierSandboxSourceProvider {
  setSandboxSource(source: FrontierSandboxSourceModule): FrontierSandboxSourceModule;
  applySandboxSourceEvent(event: FrontierSandboxSourceEvent): FrontierSandboxSourceModule;
}

export interface FrontierSandboxDynamicRuntimeOptions {
  source: FrontierSandboxSourceModule | FrontierSandboxSourceProvider | (() => FrontierSandboxMaybePromise<FrontierSandboxSourceModule>);
  createRuntime(source: FrontierSandboxSourceModule): FrontierSandboxMaybePromise<FrontierSandboxRuntime>;
}

export interface FrontierSandboxDynamicRuntime extends FrontierSandboxRuntime {
  getSource(): FrontierSandboxSourceModule | undefined;
  updateSource(source: FrontierSandboxSourceModule): void;
  refresh(): FrontierSandboxMaybePromise<void>;
}

export type FrontierSandboxActionHandler = (
  context: FrontierSandboxActionContext,
  input: JsonValue | undefined
) => FrontierSandboxMaybePromise<FrontierSandboxResultInput>;

export interface FrontierSandboxActionContext {
  readonly action: FrontierSandboxActionManifest;
  readonly module: FrontierSandboxModuleManifest;
  read(path: FrontierSandboxPath): JsonValue | undefined;
  patch: FrontierSandboxPatchBuilder;
  effect(capability: string, input?: JsonValue, metadata?: Record<string, JsonValue>): FrontierSandboxEffectRequest;
  event(kind: string, payload?: JsonValue, metadata?: Record<string, JsonValue>): FrontierSandboxEventRecord;
  log(level: FrontierSandboxLogLevel, message: string, metadata?: Record<string, JsonValue>): FrontierSandboxLogRecord;
}

export interface FrontierSandboxPatchBuilder {
  set(path: FrontierSandboxPath, value: JsonValue): PatchOperation;
  replace(path: FrontierSandboxPath, value: JsonValue): PatchOperation;
  remove(path: FrontierSandboxPath): PatchOperation;
  assign(path: FrontierSandboxPath, value: JsonObject): PatchOperation;
  append(path: FrontierSandboxPath, values: readonly JsonValue[]): PatchOperation;
  truncate(path: FrontierSandboxPath, length: number): PatchOperation;
}

export interface FrontierSandboxEffectRequest {
  kind: 'frontier.sandbox.effect';
  capability: string;
  input?: JsonValue;
  metadata?: Record<string, JsonValue>;
}

export interface FrontierSandboxEventRecord {
  kind: 'frontier.sandbox.event';
  type: string;
  payload?: JsonValue;
  metadata?: Record<string, JsonValue>;
}

export type FrontierSandboxLogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface FrontierSandboxLogRecord {
  kind: 'frontier.sandbox.log';
  level: FrontierSandboxLogLevel;
  message: string;
  metadata?: Record<string, JsonValue>;
}

export interface FrontierSandboxResult {
  patches: Patch;
  effects: FrontierSandboxEffectRequest[];
  events: FrontierSandboxEventRecord[];
  logs: FrontierSandboxLogRecord[];
  metadata?: Record<string, JsonValue>;
}

export type FrontierSandboxResultInput =
  | undefined
  | null
  | PatchOperation
  | Patch
  | FrontierSandboxEffectRequest
  | FrontierSandboxEventRecord
  | FrontierSandboxLogRecord
  | FrontierSandboxResultInput[]
  | Partial<FrontierSandboxResult>;

export interface FrontierSandboxInvokeOptions {
  state?: JsonValue;
  read?: (path: JsonPath) => JsonValue | undefined;
  causeId?: string;
  actor?: string;
  metadata?: Record<string, JsonValue>;
  signal?: AbortSignal;
}

export interface FrontierSandboxRuntime {
  invoke(
    actionId: string,
    input?: JsonValue,
    options?: FrontierSandboxInvokeOptions
  ): FrontierSandboxMaybePromise<FrontierSandboxResult>;
  dispose?(): void | Promise<void>;
}

export interface FrontierSandboxPatchSource {
  get?(): JsonValue | undefined;
  commitPatch?(patch: Patch, options?: Record<string, unknown>): JsonValue | undefined;
}

export interface FrontierSandboxActionRegistryOptions {
  runtime: FrontierSandboxRuntime;
  source: FrontierSandboxPatchSource;
  onEffect?: (effect: FrontierSandboxEffectRequest, result: FrontierSandboxResult) => unknown;
  onResult?: (result: FrontierSandboxResult, actionId: string, input: JsonValue | undefined) => unknown;
  onError?: (error: unknown, actionId: string, input: JsonValue | undefined) => unknown;
}

export interface FrontierSandboxActionRegistry {
  dispatch(actionId: string, input?: JsonValue, options?: FrontierSandboxInvokeOptions): unknown;
  commitPatch(patch: Patch, options?: Record<string, unknown>): unknown;
  history(): readonly FrontierSandboxActionHistoryRecord[];
}

export interface FrontierSandboxActionHistoryRecord {
  actionId: string;
  input?: JsonValue;
  result?: FrontierSandboxResult;
  error?: unknown;
  timestamp: number;
}

export interface FrontierSandboxSourceDiagnostic {
  code: string;
  message: string;
  index: number;
}

export interface FrontierSandboxSourcePolicy {
  allowDynamicImport?: boolean;
  allowEval?: boolean;
  allowAmbientNetwork?: boolean;
  allowAmbientClock?: boolean;
  allowAmbientRandom?: boolean;
  allowNodeBuiltins?: boolean;
}

const EMPTY_RESULT: FrontierSandboxResult = Object.freeze({
  patches: Object.freeze([]) as unknown as Patch,
  effects: Object.freeze([]) as unknown as FrontierSandboxEffectRequest[],
  events: Object.freeze([]) as unknown as FrontierSandboxEventRecord[],
  logs: Object.freeze([]) as unknown as FrontierSandboxLogRecord[]
});

const DEFAULT_SOURCE_PATTERNS: Array<{
  code: string;
  message: string;
  pattern: RegExp;
  allowed(policy: FrontierSandboxSourcePolicy): boolean;
}> = [
  {
    code: 'frontier.sandbox.eval',
    message: 'eval/new Function are not allowed in Frontier sandbox modules',
    pattern: /\b(eval\s*\(|new\s+Function\s*\()/,
    allowed: (policy) => policy.allowEval === true
  },
  {
    code: 'frontier.sandbox.dynamic-import',
    message: 'dynamic import() must be resolved by the sandbox compiler',
    pattern: /\bimport\s*\(/,
    allowed: (policy) => policy.allowDynamicImport === true
  },
  {
    code: 'frontier.sandbox.ambient-network',
    message: 'network access must go through a declared capability',
    pattern: /\b(fetch|WebSocket|XMLHttpRequest|EventSource)\b/,
    allowed: (policy) => policy.allowAmbientNetwork === true
  },
  {
    code: 'frontier.sandbox.ambient-clock',
    message: 'clock access must go through a declared capability',
    pattern: /\b(Date\s*\.|new\s+Date\s*\(|performance\s*\.now\s*\()/,
    allowed: (policy) => policy.allowAmbientClock === true
  },
  {
    code: 'frontier.sandbox.ambient-random',
    message: 'randomness must go through a declared capability',
    pattern: /\bMath\s*\.random\s*\(/,
    allowed: (policy) => policy.allowAmbientRandom === true
  },
  {
    code: 'frontier.sandbox.node-builtins',
    message: 'Node built-ins are not allowed in Frontier sandbox modules',
    pattern: /(?:from\s+['"]node:|require\s*\(\s*['"](?:node:)?(?:fs|child_process|net|tls|http|https|worker_threads|vm|module))/,
    allowed: (policy) => policy.allowNodeBuiltins === true
  }
];

export function defineSandboxModule(module: FrontierSandboxModule): FrontierSandboxModule {
  assertSandboxModule(module);
  return module;
}

export function defineSandboxSourceModule(input: FrontierSandboxSourceModuleInput): FrontierSandboxSourceModule {
  if (!input || typeof input !== 'object') throw new TypeError('Frontier sandbox source module must be an object');
  if (typeof input.id !== 'string' || input.id.length === 0) throw new TypeError('Frontier sandbox source module requires an id');
  if (!Array.isArray(input.actions)) throw new TypeError('Frontier sandbox source module requires actions');
  const actions = input.actions.map((action) => normalizeSandboxActionSource(action, input.sourcePolicy));
  return createNormalizedSandboxSourceModule(input, actions);
}

export function hydrateSandboxSourceModule(
  value: unknown,
  sourcePolicy: FrontierSandboxSourcePolicy = {}
): FrontierSandboxSourceModule {
  if (!value || typeof value !== 'object') throw new TypeError('Frontier sandbox source module snapshot must be an object');
  const record = value as FrontierSandboxSourceModuleInput & { kind?: unknown; schemaVersion?: unknown };
  if (record.kind !== undefined && record.kind !== 'frontier.sandbox.source.module') {
    throw new TypeError('Frontier sandbox source module snapshot has unsupported kind');
  }
  if (record.schemaVersion !== undefined && record.schemaVersion !== 1) {
    throw new TypeError('Frontier sandbox source module snapshot has unsupported schema version');
  }
  return defineSandboxSourceModule({
    id: record.id,
    version: record.version,
    revision: record.revision,
    actions: record.actions,
    capabilities: record.capabilities,
    metadata: record.metadata,
    manifest: record.manifest,
    contentHash: record.contentHash,
    sourcePolicy
  });
}

export function readSandboxSourceModuleAt(
  value: unknown,
  path: FrontierSandboxPath = []
): FrontierSandboxSourceModule {
  const source = readJsonPath(value as JsonValue | undefined, normalizeSandboxPath(path));
  return hydrateSandboxSourceModule(source);
}

export function getSandboxActionSource(
  source: FrontierSandboxSourceModule,
  actionId: string
): FrontierSandboxActionSource {
  for (const action of source.actions) {
    if (action.id === actionId) return action;
  }
  throw new TypeError('Unknown Frontier sandbox source action: ' + actionId);
}

export function diffSandboxSourceModules(
  previous: FrontierSandboxSourceModule,
  next: FrontierSandboxSourceModule
): FrontierSandboxSourceEvent[] {
  const events: FrontierSandboxSourceEvent[] = [];
  const previousById = new Map<string, FrontierSandboxActionSource>();
  const nextById = new Map<string, FrontierSandboxActionSource>();
  for (const action of previous.actions) previousById.set(action.id, action);
  for (const action of next.actions) nextById.set(action.id, action);
  for (const action of next.actions) {
    const before = previousById.get(action.id);
    if (!before || !sandboxActionSourceEqual(before, action)) {
      events.push({
        kind: 'frontier.sandbox.source.action.upsert',
        action,
        revision: action.revision ?? next.revision
      });
    }
  }
  for (const action of previous.actions) {
    if (!nextById.has(action.id)) {
      events.push({
        kind: 'frontier.sandbox.source.action.remove',
        actionId: action.id,
        revision: next.revision
      });
    }
  }
  return events;
}

export function replaySandboxSourceEvents(
  initial: FrontierSandboxSourceModule,
  events: readonly FrontierSandboxSourceEvent[]
): FrontierSandboxSourceModule {
  if (events.length === 0) return initial;
  const actions = initial.actions.slice();
  let revision = initial.revision;
  let metadata = initial.metadata;
  for (let i = 0; i < events.length; i++) {
    const event = events[i];
    revision = event.revision ?? revision;
    if (event.metadata) metadata = { ...(metadata ?? {}), ...event.metadata };
    if (event.kind === 'frontier.sandbox.source.action.upsert') {
      const action = normalizeSandboxActionSource(event.action);
      const index = actions.findIndex((candidate) => candidate.id === action.id);
      if (index === -1) actions.push(action);
      else actions[index] = action;
    } else if (event.kind === 'frontier.sandbox.source.action.remove') {
      const index = actions.findIndex((candidate) => candidate.id === event.actionId);
      if (index !== -1) actions.splice(index, 1);
    } else {
      throw new TypeError('Unsupported Frontier sandbox source event');
    }
  }
  return createNormalizedSandboxSourceModule({
    id: initial.id,
    version: initial.version,
    revision,
    actions,
    capabilities: initial.capabilities,
    metadata
  }, actions);
}

function createNormalizedSandboxSourceModule(
  input: FrontierSandboxSourceModuleInput,
  actions: readonly FrontierSandboxActionSource[]
): FrontierSandboxSourceModule {
  const manifest: FrontierSandboxModuleManifest = input.manifest
    ? {
        ...input.manifest,
        actions: input.manifest.actions.map((action) => ({ ...action })),
        capabilities: input.manifest.capabilities?.slice(),
        metadata: input.manifest.metadata ? { ...input.manifest.metadata } : undefined
      }
    : {
        id: input.id,
        version: input.version,
        actions: actions.map(actionSourceToManifest),
        capabilities: input.capabilities?.slice(),
        metadata: input.metadata ? { ...input.metadata } : undefined
      };
  assertSandboxSourceModuleActions(manifest, actions);
  const contentHash = hashSandboxSourceModuleInput(input.id, input.version, input.revision, manifest, actions);
  if (input.contentHash && input.contentHash !== contentHash) {
    throw new TypeError('Frontier sandbox source module hash mismatch for ' + input.id);
  }
  const module: FrontierSandboxSourceModule = {
    kind: 'frontier.sandbox.source.module',
    schemaVersion: 1,
    id: input.id,
    version: input.version,
    revision: input.revision,
    manifest,
    actions,
    capabilities: input.capabilities?.slice(),
    metadata: input.metadata ? assertJsonRecord(input.metadata) : undefined,
    contentHash
  };
  return module;
}

export function applySandboxSourceEvent(
  source: FrontierSandboxSourceModule,
  event: FrontierSandboxSourceEvent
): FrontierSandboxSourceModule {
  const actions = source.actions.slice();
  if (event.kind === 'frontier.sandbox.source.action.upsert') {
    const action = normalizeSandboxActionSource(event.action);
    const index = actions.findIndex((candidate) => candidate.id === action.id);
    if (index === -1) actions.push(action);
    else actions[index] = action;
  } else if (event.kind === 'frontier.sandbox.source.action.remove') {
    const index = actions.findIndex((candidate) => candidate.id === event.actionId);
    if (index !== -1) actions.splice(index, 1);
  } else {
    throw new TypeError('Unsupported Frontier sandbox source event');
  }
  return createNormalizedSandboxSourceModule({
    id: source.id,
    version: source.version,
    revision: event.revision ?? source.revision,
    actions,
    capabilities: source.capabilities,
    metadata: event.metadata ? { ...(source.metadata ?? {}), ...event.metadata } : source.metadata
  }, actions);
}

export function createSandboxSourceStore(initial: FrontierSandboxSourceModule): FrontierSandboxSourceStore {
  let current = initial;
  const subscribers = new Set<(source: FrontierSandboxSourceModule, event?: FrontierSandboxSourceEvent) => void>();
  function notify(event?: FrontierSandboxSourceEvent): void {
    for (const subscriber of Array.from(subscribers)) subscriber(current, event);
  }
  return {
    getSandboxSource() {
      return current;
    },
    subscribeSandboxSource(callback) {
      subscribers.add(callback);
      let active = true;
      return {
        get active() {
          return active;
        },
        unsubscribe() {
          if (!active) return;
          active = false;
          subscribers.delete(callback);
        }
      };
    },
    setSandboxSource(source) {
      current = source;
      notify();
      return current;
    },
    applySandboxSourceEvent(event) {
      current = applySandboxSourceEvent(current, event);
      notify(event);
      return current;
    }
  };
}

export function createDynamicSandboxRuntime(options: FrontierSandboxDynamicRuntimeOptions): FrontierSandboxDynamicRuntime {
  let explicitSource = isSandboxSourceModule(options.source) ? options.source : undefined;
  let currentSource: FrontierSandboxSourceModule | undefined;
  let currentRuntime: FrontierSandboxRuntime | undefined;
  let currentHash: string | undefined;
  let dirty = true;
  if (isSandboxSourceProvider(options.source) && options.source.subscribeSandboxSource) {
    options.source.subscribeSandboxSource(() => {
      dirty = true;
    });
  }
  async function ensureRuntime(): Promise<FrontierSandboxRuntime> {
    const nextSource = explicitSource ?? await resolveSandboxSource(options.source);
    const nextHash = nextSource.contentHash || hashSandboxSourceModule(nextSource);
    if (!dirty && currentRuntime && currentHash === nextHash) return currentRuntime;
    if (currentRuntime && currentRuntime.dispose) await currentRuntime.dispose();
    currentSource = nextSource;
    currentHash = nextHash;
    currentRuntime = await options.createRuntime(nextSource);
    dirty = false;
    return currentRuntime;
  }
  return {
    async invoke(actionId, input, invokeOptions = {}) {
      const runtime = await ensureRuntime();
      return runtime.invoke(actionId, input, invokeOptions);
    },
    getSource() {
      return currentSource ?? explicitSource;
    },
    updateSource(source) {
      explicitSource = source;
      dirty = true;
    },
    async refresh() {
      await ensureRuntime();
    },
    async dispose() {
      await currentRuntime?.dispose?.();
    }
  };
}

export function createLocalSandboxRuntime(module: FrontierSandboxModule): FrontierSandboxRuntime {
  assertSandboxModule(module);
  return {
    async invoke(actionId, input, options = {}) {
      if (options.signal?.aborted) throw new Error('Frontier sandbox invocation aborted before start');
      if (input !== undefined) assertJsonValue(input);
      const action = module.actions[actionId];
      if (typeof action !== 'function') throw new TypeError('Unknown Frontier sandbox action: ' + actionId);
      const actionManifest = getSandboxActionManifest(module.manifest, actionId);
      const context = createSandboxActionContext(module.manifest, actionManifest, options);
      const raw = await action(context, input);
      if (options.signal?.aborted) throw new Error('Frontier sandbox invocation aborted');
      const result = normalizeSandboxResult(raw);
      validateSandboxResult(actionManifest, result, module.manifest);
      return result;
    }
  };
}

export function createFrontierSandboxActionRegistry(
  options: FrontierSandboxActionRegistryOptions
): FrontierSandboxActionRegistry {
  const history: FrontierSandboxActionHistoryRecord[] = [];
  return {
    dispatch(actionId, input, invokeOptions = {}) {
      const timestamp = Date.now();
      const state = invokeOptions.state ?? options.source.get?.();
      const run = options.runtime.invoke(actionId, input, { ...invokeOptions, state });
      return Promise.resolve(run).then(
        (result) => {
          if (result.patches.length !== 0) {
            options.source.commitPatch?.(result.patches, {
              origin: actionId,
              causeId: invokeOptions.causeId,
              actor: invokeOptions.actor,
              metadata: invokeOptions.metadata
            });
          }
          for (const effect of result.effects) options.onEffect?.(effect, result);
          options.onResult?.(result, actionId, input);
          history.push({ actionId, input, result, timestamp });
          return result;
        },
        (error) => {
          options.onError?.(error, actionId, input);
          history.push({ actionId, input, error, timestamp });
          throw error;
        }
      );
    },
    commitPatch(patch, commitOptions) {
      return options.source.commitPatch?.(patch, commitOptions);
    },
    history() {
      return history.slice();
    }
  };
}

export function createSandboxActionContext(
  moduleManifest: FrontierSandboxModuleManifest,
  action: FrontierSandboxActionManifest,
  options: FrontierSandboxInvokeOptions
): FrontierSandboxActionContext {
  return {
    action,
    module: moduleManifest,
    read(path) {
      const normalized = normalizeSandboxPath(path);
      assertSandboxPathAllowed(action.reads, normalized, 'read', action.id);
      if (options.read) return options.read(normalized);
      return readJsonPath(options.state, normalized);
    },
    patch: createSandboxPatchBuilder(),
    effect(capability, input, metadata) {
      assertSandboxCapabilityAllowed(action, moduleManifest, capability);
      if (input !== undefined) assertJsonValue(input);
      return {
        kind: 'frontier.sandbox.effect',
        capability,
        input,
        metadata: metadata ? assertJsonRecord(metadata) : undefined
      };
    },
    event(type, payload, metadata) {
      if (payload !== undefined) assertJsonValue(payload);
      return {
        kind: 'frontier.sandbox.event',
        type,
        payload,
        metadata: metadata ? assertJsonRecord(metadata) : undefined
      };
    },
    log(level, message, metadata) {
      return {
        kind: 'frontier.sandbox.log',
        level,
        message,
        metadata: metadata ? assertJsonRecord(metadata) : undefined
      };
    }
  };
}

export function createSandboxPatchBuilder(): FrontierSandboxPatchBuilder {
  return {
    set(path, value) {
      assertJsonValue(value);
      return [OP_SET, normalizeSandboxPath(path), value];
    },
    replace(path, value) {
      assertJsonValue(value);
      return [OP_SET, normalizeSandboxPath(path), value];
    },
    remove(path) {
      return [OP_REMOVE, normalizeSandboxPath(path)];
    },
    assign(path, value) {
      assertJsonRecord(value);
      return [OP_ASSIGN, normalizeSandboxPath(path), value];
    },
    append(path, values) {
      for (let i = 0; i < values.length; i++) assertJsonValue(values[i]);
      return [OP_APPEND, normalizeSandboxPath(path), values.slice() as JsonValue[]];
    },
    truncate(path, length) {
      if (!Number.isSafeInteger(length) || length < 0) throw new TypeError('Frontier sandbox truncate length must be a non-negative safe integer');
      return [OP_TRUNCATE, normalizeSandboxPath(path), length];
    }
  };
}

export function normalizeSandboxResult(input: FrontierSandboxResultInput): FrontierSandboxResult {
  if (input === undefined || input === null) return emptySandboxResult();
  if (isPatchOperation(input)) return { ...emptySandboxResult(), patches: [input] };
  if (isPatch(input)) return { ...emptySandboxResult(), patches: input.slice() as Patch };
  if (Array.isArray(input)) {
    const out = mutableSandboxResult();
    for (let i = 0; i < input.length; i++) mergeSandboxResult(out, normalizeSandboxResult(input[i] as FrontierSandboxResultInput));
    return out;
  }
  if (isSandboxEffect(input)) return { ...emptySandboxResult(), effects: [input] };
  if (isSandboxEvent(input)) return { ...emptySandboxResult(), events: [input] };
  if (isSandboxLog(input)) return { ...emptySandboxResult(), logs: [input] };
  if (typeof input === 'object') {
    const record = input as Partial<FrontierSandboxResult>;
    const out = mutableSandboxResult();
    if (record.patches) out.patches.push(...normalizeSandboxResult(record.patches).patches);
    if ((record as { patch?: Patch | PatchOperation }).patch) out.patches.push(...normalizeSandboxResult((record as { patch?: Patch | PatchOperation }).patch).patches);
    if (record.effects) out.effects.push(...record.effects);
    if (record.events) out.events.push(...record.events);
    if (record.logs) out.logs.push(...record.logs);
    if (record.metadata) out.metadata = assertJsonRecord(record.metadata);
    return out;
  }
  throw new TypeError('Unsupported Frontier sandbox result');
}

export function validateSandboxResult(
  action: FrontierSandboxActionManifest,
  result: FrontierSandboxResult,
  moduleManifest?: FrontierSandboxModuleManifest
): FrontierSandboxResult {
  assertPatch(result.patches);
  for (let i = 0; i < result.patches.length; i++) {
    const path = result.patches[i][1];
    assertSandboxPathAllowed(action.writes, path, 'write', action.id);
  }
  for (const effect of result.effects) {
    assertSandboxCapabilityAllowed(action, moduleManifest, effect.capability);
    if (effect.input !== undefined) assertJsonValue(effect.input);
    if (effect.metadata) assertJsonRecord(effect.metadata);
  }
  for (const event of result.events) {
    if (event.payload !== undefined) assertJsonValue(event.payload);
    if (event.metadata) assertJsonRecord(event.metadata);
  }
  for (const log of result.logs) {
    if (log.metadata) assertJsonRecord(log.metadata);
  }
  if (result.metadata) assertJsonRecord(result.metadata);
  return result;
}

export function scanSandboxSource(source: string, policy: FrontierSandboxSourcePolicy = {}): FrontierSandboxSourceDiagnostic[] {
  const diagnostics: FrontierSandboxSourceDiagnostic[] = [];
  for (const rule of DEFAULT_SOURCE_PATTERNS) {
    if (rule.allowed(policy)) continue;
    const match = rule.pattern.exec(source);
    if (match && match.index >= 0) diagnostics.push({ code: rule.code, message: rule.message, index: match.index });
  }
  return diagnostics;
}

export function assertSandboxSource(source: string, policy: FrontierSandboxSourcePolicy = {}): void {
  const diagnostics = scanSandboxSource(source, policy);
  if (diagnostics.length !== 0) {
    throw new TypeError(diagnostics.map((diagnostic) => diagnostic.code + ': ' + diagnostic.message).join('\n'));
  }
}

export function hashSandboxSourceModule(source: FrontierSandboxSourceModule): string {
  return hashSandboxSourceModuleInput(source.id, source.version, source.revision, source.manifest, source.actions);
}

export function hashSandboxContent(value: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return 'fnv1a32:' + hash.toString(16).padStart(8, '0');
}

export function normalizeSandboxPath(path: FrontierSandboxPath): JsonPath {
  if (Array.isArray(path)) {
    const out = new Array<PathSegment>(path.length);
    for (let i = 0; i < path.length; i++) out[i] = normalizePathSegment(path[i]);
    return out;
  }
  if (path === '') return [];
  if (typeof path !== 'string') throw new TypeError('Frontier sandbox path must be a JSON pointer string or path array');
  return parsePointer(path) as JsonPath;
}

export function sandboxPathToPointer(path: FrontierSandboxPath): string {
  return stringifyPointer(normalizeSandboxPath(path));
}

export function sandboxPathMatches(pattern: FrontierSandboxPath, path: FrontierSandboxPath): boolean {
  const patternPath = normalizeSandboxPath(pattern);
  const actualPath = normalizeSandboxPath(path);
  for (let i = 0; i < patternPath.length; i++) {
    const expected = String(patternPath[i]);
    if (expected === '**') return true;
    if (i >= actualPath.length) return false;
    if (expected === '*' || expected.charCodeAt(0) === 58) continue;
    if (expected !== String(actualPath[i])) return false;
  }
  return patternPath.length === actualPath.length;
}

export function assertSandboxModule(module: FrontierSandboxModule): void {
  if (!module || typeof module !== 'object') throw new TypeError('Frontier sandbox module must be an object');
  if (!module.manifest || typeof module.manifest.id !== 'string' || module.manifest.id.length === 0) {
    throw new TypeError('Frontier sandbox module manifest requires an id');
  }
  if (!Array.isArray(module.manifest.actions)) throw new TypeError('Frontier sandbox module manifest requires actions');
  for (const action of module.manifest.actions) {
    if (!action || typeof action.id !== 'string' || action.id.length === 0) {
      throw new TypeError('Frontier sandbox action manifest requires an id');
    }
    if (typeof module.actions[action.id] !== 'function') {
      throw new TypeError('Frontier sandbox module missing action handler: ' + action.id);
    }
  }
}

export function getSandboxActionManifest(
  manifest: FrontierSandboxModuleManifest,
  actionId: string
): FrontierSandboxActionManifest {
  for (const action of manifest.actions) {
    if (action.id === actionId) return action;
  }
  throw new TypeError('Unknown Frontier sandbox action manifest: ' + actionId);
}

function assertSandboxPathAllowed(
  patterns: readonly FrontierSandboxPath[] | undefined,
  path: JsonPath,
  operation: 'read' | 'write',
  actionId: string
): void {
  if (!patterns || patterns.length === 0) {
    throw new TypeError('Frontier sandbox action ' + actionId + ' does not declare any ' + operation + ' paths');
  }
  for (let i = 0; i < patterns.length; i++) {
    if (sandboxPathMatches(patterns[i], path)) return;
  }
  throw new TypeError(
    'Frontier sandbox action ' + actionId + ' attempted to ' + operation + ' undeclared path ' + stringifyPointer(path)
  );
}

function normalizeSandboxActionSource(
  action: FrontierSandboxActionSource,
  inheritedPolicy: FrontierSandboxSourcePolicy = {}
): FrontierSandboxActionSource {
  if (!action || typeof action !== 'object') throw new TypeError('Frontier sandbox source action must be an object');
  if (typeof action.id !== 'string' || action.id.length === 0) throw new TypeError('Frontier sandbox source action requires an id');
  if (typeof action.source !== 'string') throw new TypeError('Frontier sandbox source action requires source text');
  const sourcePolicy = { ...inheritedPolicy, ...(action.sourcePolicy ?? {}) };
  assertSandboxSource(action.source, sourcePolicy);
  const contentHash = hashSandboxContent(action.source);
  if (action.contentHash && action.contentHash !== contentHash) {
    throw new TypeError('Frontier sandbox action source hash mismatch for ' + action.id);
  }
  return {
    ...action,
    reads: action.reads?.slice(),
    writes: action.writes?.slice(),
    capabilities: action.capabilities?.slice(),
    metadata: action.metadata ? { ...action.metadata } : undefined,
    sourcePolicy,
    contentHash
  };
}

function actionSourceToManifest(action: FrontierSandboxActionSource): FrontierSandboxActionManifest {
  return {
    id: action.id,
    version: action.version,
    reads: action.reads?.slice(),
    writes: action.writes?.slice(),
    capabilities: action.capabilities?.slice(),
    metadata: action.metadata ? { ...action.metadata } : undefined
  };
}

function sandboxActionSourceEqual(left: FrontierSandboxActionSource, right: FrontierSandboxActionSource): boolean {
  if (left.contentHash && right.contentHash && left.contentHash === right.contentHash) {
    return stableSandboxStringify(actionSourceToManifest(left)) === stableSandboxStringify(actionSourceToManifest(right));
  }
  return stableSandboxStringify({
    ...actionSourceToManifest(left),
    format: left.format,
    language: left.language,
    revision: left.revision,
    source: left.source,
    contentHash: left.contentHash
  }) === stableSandboxStringify({
    ...actionSourceToManifest(right),
    format: right.format,
    language: right.language,
    revision: right.revision,
    source: right.source,
    contentHash: right.contentHash
  });
}

function assertSandboxSourceModuleActions(
  manifest: FrontierSandboxModuleManifest,
  actions: readonly FrontierSandboxActionSource[]
): void {
  const actionIds = new Set<string>();
  for (const action of actions) {
    if (actionIds.has(action.id)) throw new TypeError('Duplicate Frontier sandbox source action: ' + action.id);
    actionIds.add(action.id);
  }
  for (const action of manifest.actions) {
    if (!actionIds.has(action.id)) {
      throw new TypeError('Frontier sandbox source module missing source for action: ' + action.id);
    }
  }
}

function hashSandboxSourceModuleInput(
  id: string,
  version: string | undefined,
  revision: FrontierSandboxSourceRevision | undefined,
  manifest: FrontierSandboxModuleManifest,
  actions: readonly FrontierSandboxActionSource[]
): string {
  return hashSandboxContent(stableSandboxStringify({
    id,
    version,
    revision,
    manifest,
    actions: actions.map((action) => ({
      id: action.id,
      version: action.version,
      format: action.format,
      language: action.language,
      revision: action.revision,
      source: action.source,
      reads: action.reads,
      writes: action.writes,
      capabilities: action.capabilities,
      metadata: action.metadata
    }))
  }));
}

function stableSandboxStringify(value: unknown): string {
  if (value === undefined) return 'null';
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return '[' + value.map(stableSandboxStringify).join(',') + ']';
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record).sort();
  return '{' + keys.map((key) => JSON.stringify(key) + ':' + stableSandboxStringify(record[key])).join(',') + '}';
}

async function resolveSandboxSource(
  source: FrontierSandboxSourceModule | FrontierSandboxSourceProvider | (() => FrontierSandboxMaybePromise<FrontierSandboxSourceModule>)
): Promise<FrontierSandboxSourceModule> {
  if (isSandboxSourceModule(source)) return source;
  if (typeof source === 'function') return source();
  return source.getSandboxSource();
}

function isSandboxSourceModule(value: unknown): value is FrontierSandboxSourceModule {
  return !!value && typeof value === 'object' && (value as FrontierSandboxSourceModule).kind === 'frontier.sandbox.source.module';
}

function isSandboxSourceProvider(value: unknown): value is FrontierSandboxSourceProvider {
  return !!value && typeof value === 'object' && typeof (value as FrontierSandboxSourceProvider).getSandboxSource === 'function';
}

function assertSandboxCapabilityAllowed(
  action: FrontierSandboxActionManifest,
  moduleManifest: FrontierSandboxModuleManifest | undefined,
  capability: string
): void {
  if (action.capabilities?.includes(capability)) return;
  if (moduleManifest?.capabilities?.includes(capability)) return;
  throw new TypeError('Frontier sandbox action ' + action.id + ' attempted undeclared capability ' + capability);
}

function readJsonPath(value: JsonValue | undefined, path: JsonPath): JsonValue | undefined {
  let cursor: JsonValue | undefined = value;
  for (let i = 0; i < path.length; i++) {
    if (cursor === null || cursor === undefined || typeof cursor !== 'object') return undefined;
    cursor = (cursor as Record<string, JsonValue>)[String(path[i])];
  }
  return cursor;
}

function normalizePathSegment(segment: unknown): PathSegment {
  if (typeof segment === 'string' || typeof segment === 'number') return segment;
  throw new TypeError('Frontier sandbox path segment must be a string or number');
}

function assertJsonRecord(value: Record<string, JsonValue>): Record<string, JsonValue> {
  assertJsonValue(value as JsonValue);
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError('Frontier sandbox metadata must be a JSON object');
  }
  return value;
}

function emptySandboxResult(): FrontierSandboxResult {
  return {
    patches: EMPTY_RESULT.patches.slice() as Patch,
    effects: EMPTY_RESULT.effects.slice(),
    events: EMPTY_RESULT.events.slice(),
    logs: EMPTY_RESULT.logs.slice()
  };
}

function mutableSandboxResult(): FrontierSandboxResult {
  return { patches: [], effects: [], events: [], logs: [] };
}

function mergeSandboxResult(target: FrontierSandboxResult, next: FrontierSandboxResult): void {
  target.patches.push(...next.patches);
  target.effects.push(...next.effects);
  target.events.push(...next.events);
  target.logs.push(...next.logs);
  if (next.metadata) target.metadata = { ...(target.metadata ?? {}), ...next.metadata };
}

function isPatchOperation(value: unknown): value is PatchOperation {
  return Array.isArray(value) && typeof value[0] === 'number' && Array.isArray(value[1]);
}

function isPatch(value: unknown): value is Patch {
  if (!Array.isArray(value)) return false;
  for (let i = 0; i < value.length; i++) {
    if (!isPatchOperation(value[i])) return false;
  }
  return true;
}

function isSandboxEffect(value: unknown): value is FrontierSandboxEffectRequest {
  return !!value && typeof value === 'object' && (value as FrontierSandboxEffectRequest).kind === 'frontier.sandbox.effect';
}

function isSandboxEvent(value: unknown): value is FrontierSandboxEventRecord {
  return !!value && typeof value === 'object' && (value as FrontierSandboxEventRecord).kind === 'frontier.sandbox.event';
}

function isSandboxLog(value: unknown): value is FrontierSandboxLogRecord {
  return !!value && typeof value === 'object' && (value as FrontierSandboxLogRecord).kind === 'frontier.sandbox.log';
}
