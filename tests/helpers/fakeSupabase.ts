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

export function resetFakeSupabase(): void {
  calls.length = 0;
  rpcResponder = () => ({ data: null, error: null });
}

function queryBuilder(table: string) {
  const result: Result = { data: [], error: null };
  const builder = {
    select: () => builder,
    order: () => builder,
    range: () => builder,
    eq: () => builder,
    insert: (payload: unknown) => (calls.push({ table, op: "insert", payload }), builder),
    update: (payload: unknown) => (calls.push({ table, op: "update", payload }), builder),
    upsert: (payload: unknown) => (calls.push({ table, op: "upsert", payload }), builder),
    delete: () => (calls.push({ table, op: "delete" }), builder),
    then: (resolve: (r: Result) => unknown, reject?: (e: unknown) => unknown) => Promise.resolve(result).then(resolve, reject),
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
