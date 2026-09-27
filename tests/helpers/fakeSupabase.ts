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

/** Rows a select on each table returns (all columns; the select's column
 * list and .eq/.in filters are applied). */
const tableRows = new Map<string, Record<string, unknown>[]>();

export function setTableRows(table: string, rows: object[]): void {
  tableRows.set(table, rows as Record<string, unknown>[]);
}

/** Makes a select fail when its column list matches, e.g. a column that a
 * migration hasn't added yet. */
let selectFailure: { columns: RegExp; message: string } | null = null;

export function failSelect(columns: RegExp, message: string): void {
  selectFailure = { columns, message };
}

export function resetFakeSupabase(): void {
  tableRows.clear();
  selectFailure = null;
  calls.length = 0;
  rpcResponder = () => ({ data: null, error: null });
  writeResponder = () => ({ data: null, error: null });
}

function queryBuilder(table: string) {
  let write: string | null = null;
  let columns = "*";
  const filters: ((row: Record<string, unknown>) => boolean)[] = [];
  const record = (op: string, payload?: unknown) => {
    write = op;
    calls.push({ table, op, payload });
    return builder;
  };
  function selectResult(): Result {
    if (selectFailure && selectFailure.columns.test(columns)) return { data: null, error: { message: selectFailure.message } };
    calls.push({ table, op: "select", payload: columns });
    const rows = (tableRows.get(table) ?? []).filter((row) => filters.every((f) => f(row)));
    if (columns === "*") return { data: rows, error: null };
    const keys = columns.split(",").map((c) => c.trim());
    return { data: rows.map((row) => Object.fromEntries(keys.map((k) => [k, row[k]]))), error: null };
  }
  const builder = {
    select: (cols = "*") => ((columns = cols), builder),
    order: () => builder,
    range: () => builder,
    eq: (column: string, value: unknown) => (filters.push((row) => row[column] === value), builder),
    in: (column: string, values: unknown[]) => (filters.push((row) => values.includes(row[column])), builder),
    insert: (payload: unknown) => record("insert", payload),
    update: (payload: unknown) => record("update", payload),
    upsert: (payload: unknown) => record("upsert", payload),
    delete: () => record("delete"),
    then: (resolve: (r: Result) => unknown, reject?: (e: unknown) => unknown) =>
      Promise.resolve(write ? writeResponder(table, write) : selectResult()).then(resolve, reject),
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
