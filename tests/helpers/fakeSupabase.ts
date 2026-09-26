// A stand-in for the Supabase browser client. Tests never touch a real
// database: every call is recorded in `calls` and answered with "no error",
// or with whatever `rpcResponder` returns for an RPC.

export interface RecordedCall {
  table?: string;
  op: string;
  payload?: unknown;
}

export const calls: RecordedCall[] = [];

type Result = { data: unknown; error: { message: string } | null };

export let rpcResponder: (fn: string, args: unknown) => Result = () => ({ data: null, error: null });

export function setRpcResponder(fn: typeof rpcResponder): void {
  rpcResponder = fn;
}

/** Answers table writes (insert / update / upsert / delete); "no error"
 * unless a test says otherwise. */
export let writeResponder: (table: string, op: string) => Result = () => ({ data: null, error: null });

export function setWriteResponder(fn: typeof writeResponder): void {
  writeResponder = fn;
}

export function resetFakeSupabase(): void {
  calls.length = 0;
  rpcResponder = () => ({ data: null, error: null });
  writeResponder = () => ({ data: null, error: null });
}

function queryBuilder(table: string) {
  let write: string | null = null;
  const record = (op: string, payload?: unknown) => {
    write = op;
    calls.push({ table, op, payload });
    return builder;
  };
  const builder = {
    select: () => builder,
    order: () => builder,
    range: () => builder,
    eq: () => builder,
    insert: (payload: unknown) => record("insert", payload),
    update: (payload: unknown) => record("update", payload),
    upsert: (payload: unknown) => record("upsert", payload),
    delete: () => record("delete"),
    then: (resolve: (r: Result) => unknown, reject?: (e: unknown) => unknown) =>
      Promise.resolve(write ? writeResponder(table, write) : { data: [], error: null }).then(resolve, reject),
  };
  return builder;
}

export const fakeClient = {
  from: (table: string) => queryBuilder(table),
  rpc: (fn: string, args: unknown) => {
    calls.push({ op: `rpc:${fn}`, payload: args });
    return Promise.resolve(rpcResponder(fn, args));
  },
  channel: () => {
    const channel = { on: () => channel, subscribe: () => channel };
    return channel;
  },
};
