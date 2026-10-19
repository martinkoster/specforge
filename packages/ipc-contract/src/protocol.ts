// SPDX-License-Identifier: Apache-2.0
// Message protocol over a MessagePort: version handshake, validated requests/responses, batched events (ADR-015).
import { z } from 'zod';
import {
  CONTRACT,
  CONTRACT_VERSION,
  type CommandInput,
  type CommandName,
  type CommandOutput,
  type ContractHandlers,
  type EventName,
  type EventPayload,
  type QueryInput,
  type QueryName,
  type QueryOutput,
} from './contract.js';

/** Minimal port abstraction over browser MessagePort, Electron MessagePortMain and Node MessagePort. */
export interface PortLike {
  postMessage(message: unknown): void;
  onMessage(listener: (message: unknown) => void): void;
}

export class IpcError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'IpcError';
  }
}

export class IpcValidationError extends IpcError {
  constructor(
    message: string,
    readonly issues: unknown[] = [],
  ) {
    super('VALIDATION_ERROR', message);
    this.name = 'IpcValidationError';
  }
}

const Envelope = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('hello'), version: z.string() }),
  z.object({ kind: z.literal('hello-ack'), version: z.string() }),
  z.object({ kind: z.literal('request'), id: z.number(), type: z.enum(['command', 'query']), name: z.string(), payload: z.unknown() }),
  z.object({
    kind: z.literal('response'),
    id: z.number(),
    ok: z.boolean(),
    result: z.unknown().optional(),
    error: z.object({ code: z.string(), message: z.string(), issues: z.array(z.unknown()).optional() }).optional(),
  }),
  z.object({ kind: z.literal('events'), batch: z.array(z.object({ name: z.string(), payload: z.unknown() })) }),
]);
type Envelope = z.infer<typeof Envelope>;

const major = (version: string) => version.split('.')[0];
const MAX_BATCH_DELAY_MS = 50;

function operation(type: 'command' | 'query', name: string): { input: z.ZodType; output: z.ZodType } | undefined {
  const table = (type === 'command' ? CONTRACT.commands : CONTRACT.queries) as Record<string, { input: z.ZodType; output: z.ZodType }>;
  return Object.hasOwn(table, name) ? table[name] : undefined;
}

function validate<T>(schema: z.ZodType<T>, value: unknown, what: string): T {
  const result = schema.safeParse(value);
  if (!result.success) throw new IpcValidationError(`Invalid ${what}: ${result.error.message}`, result.error.issues);
  return result.data;
}

export interface ServeOptions {
  version?: string;
  /** Delay before a batch of events is flushed (≤ 50 ms). */
  batchDelayMs?: number;
}

export interface ContractServer {
  emit<N extends EventName>(name: N, payload: EventPayload<N>): void;
}

/** Core side: answers the handshake, validates and dispatches requests, batches events. */
export function serveContract(port: PortLike, handlers: ContractHandlers, options: ServeOptions = {}): ContractServer {
  const version = options.version ?? CONTRACT_VERSION;
  const delay = Math.min(options.batchDelayMs ?? 16, MAX_BATCH_DELAY_MS);
  let queue: Array<{ name: string; payload: unknown }> = [];
  let timer: ReturnType<typeof setTimeout> | undefined;

  const respond = async (request: Extract<Envelope, { kind: 'request' }>) => {
    const op = operation(request.type, request.name);
    if (!op) {
      port.postMessage({
        kind: 'response',
        id: request.id,
        ok: false,
        error: { code: 'UNKNOWN_OPERATION', message: `Unknown ${request.type} ${request.name}` },
      });
      return;
    }
    try {
      const input = validate(op.input, request.payload, `${request.name} input`);
      const handler = (handlers as unknown as Record<string, ((input: unknown) => Promise<unknown>) | undefined>)[request.name];
      if (!handler) {
        port.postMessage({
          kind: 'response',
          id: request.id,
          ok: false,
          error: { code: 'NOT_IMPLEMENTED', message: `${request.name} is not available yet` },
        });
        return;
      }
      const result = validate(op.output, await handler(input), `${request.name} output`);
      port.postMessage({ kind: 'response', id: request.id, ok: true, result });
    } catch (e) {
      const error =
        e instanceof IpcValidationError
          ? { code: e.code, message: e.message, issues: e.issues }
          : e instanceof IpcError
            ? // Handlers report domain errors with their own code (e.g. RUNS_ACTIVE).
              { code: e.code, message: e.message }
            : { code: 'HANDLER_ERROR', message: e instanceof Error ? e.message : String(e) };
      port.postMessage({ kind: 'response', id: request.id, ok: false, error });
    }
  };

  port.onMessage((raw) => {
    const parsed = Envelope.safeParse(raw);
    if (!parsed.success) return;
    const message = parsed.data;
    if (message.kind === 'hello') port.postMessage({ kind: 'hello-ack', version });
    if (message.kind === 'request') void respond(message);
  });

  return {
    emit(name, payload) {
      validate(CONTRACT.events[name] as z.ZodType, payload, `${name} event`);
      queue.push({ name, payload });
      timer ??= setTimeout(() => {
        timer = undefined;
        const batch = queue;
        queue = [];
        port.postMessage({ kind: 'events', batch });
      }, delay);
    },
  };
}

export interface SubscribeOptions {
  /** Called once per delivered batch with the number of matching events. */
  onBatch?(count: number): void;
}

export interface ContractClient {
  command<N extends CommandName>(name: N, input: CommandInput<N>): Promise<CommandOutput<N>>;
  query<N extends QueryName>(name: N, input: QueryInput<N>): Promise<QueryOutput<N>>;
  subscribe<N extends EventName>(name: N, handler: (payload: EventPayload<N>) => void, options?: SubscribeOptions): () => void;
}

export interface ConnectOptions {
  version?: string;
  timeoutMs?: number;
}

/** UI side: performs the version handshake and returns a typed, validating client. */
export function connectClient(port: PortLike, options: ConnectOptions = {}): Promise<ContractClient> {
  const version = options.version ?? CONTRACT_VERSION;
  const pending = new Map<number, (message: Extract<Envelope, { kind: 'response' }>) => void>();
  const subscribers = new Map<string, Set<{ handler: (payload: unknown) => void; options: SubscribeOptions }>>();
  let nextId = 1;
  let onHello: ((coreVersion: string) => void) | undefined;

  port.onMessage((raw) => {
    const parsed = Envelope.safeParse(raw);
    if (!parsed.success) return;
    const message = parsed.data;
    if (message.kind === 'hello-ack') onHello?.(message.version);
    if (message.kind === 'response') {
      pending.get(message.id)?.(message);
      pending.delete(message.id);
    }
    if (message.kind === 'events') {
      for (const [name, subs] of subscribers) {
        const items = message.batch.filter((e) => e.name === name);
        if (items.length === 0) continue;
        for (const sub of subs) {
          for (const item of items) sub.handler(validate(CONTRACT.events[name as EventName] as z.ZodType, item.payload, `${name} event`));
          sub.options.onBatch?.(items.length);
        }
      }
    }
  });

  const request = (type: 'command' | 'query', name: string, input: unknown): Promise<unknown> => {
    const op = operation(type, name);
    if (!op) return Promise.reject(new IpcError('UNKNOWN_OPERATION', `Unknown ${type} ${name}`));
    try {
      validate(op.input, input, `${name} input`);
    } catch (e) {
      return Promise.reject(e);
    }
    const id = nextId++;
    return new Promise((resolve, reject) => {
      pending.set(id, (response) => {
        if (response.ok) {
          try {
            resolve(validate(op.output, response.result, `${name} output`));
          } catch (e) {
            reject(e);
          }
          return;
        }
        const error = response.error ?? { code: 'UNKNOWN', message: 'Unknown error' };
        reject(
          error.code === 'VALIDATION_ERROR' ? new IpcValidationError(error.message, error.issues) : new IpcError(error.code, error.message),
        );
      });
      port.postMessage({ kind: 'request', id, type, name, payload: input });
    });
  };

  const client: ContractClient = {
    command: (name, input) => request('command', name, input) as never,
    query: (name, input) => request('query', name, input) as never,
    subscribe(name, handler, subscribeOptions = {}) {
      const set = subscribers.get(name) ?? new Set();
      subscribers.set(name, set);
      const entry = { handler: handler as (payload: unknown) => void, options: subscribeOptions };
      set.add(entry);
      return () => set.delete(entry);
    },
  };

  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new IpcError('HANDSHAKE_TIMEOUT', 'The SpecForge core did not answer the connection handshake.')),
      options.timeoutMs ?? 5000,
    );
    onHello = (coreVersion) => {
      clearTimeout(timer);
      if (major(coreVersion) !== major(version)) {
        reject(
          new IpcError(
            'VERSION_MISMATCH',
            `Incompatible SpecForge components: UI contract ${version}, core contract ${coreVersion}. Please restart or reinstall SpecForge.`,
          ),
        );
        return;
      }
      resolve(client);
    };
    port.postMessage({ kind: 'hello', version });
  });
}
