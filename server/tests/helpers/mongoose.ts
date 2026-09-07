// Minimal stand-ins to a chainable query, and a document you can await .populate() on.

type Recorded = {
  populate: unknown[][];
  sort: unknown[][];
  select: unknown[][];
  limit: unknown[][];
  lean: unknown[][];
};

export type QueryStub = {
  calls: Recorded;
  populate: (...args: unknown[]) => QueryStub;
  sort: (...args: unknown[]) => QueryStub;
  select: (...args: unknown[]) => QueryStub;
  limit: (...args: unknown[]) => QueryStub;
  lean: (...args: unknown[]) => QueryStub;
  then: (
    resolve: (value: unknown) => unknown,
    reject?: (reason: unknown) => unknown,
  ) => Promise<unknown>;
};

export const queryStub = (result: unknown): QueryStub => {
  const calls: Recorded = { populate: [], sort: [], select: [], limit: [], lean: [] };
  const query: QueryStub = {
    calls,
    populate: (...args) => (calls.populate.push(args), query),
    sort: (...args) => (calls.sort.push(args), query),
    select: (...args) => (calls.select.push(args), query),
    limit: (...args) => (calls.limit.push(args), query),
    lean: (...args) => (calls.lean.push(args), query),
    then: (resolve, reject) => Promise.resolve(result).then(resolve, reject),
  };
  return query;
};

// a document whose populate() resolves to itself, as mongoose's does
export const docStub = <T extends Record<string, unknown>>(fields: T) => {
  const doc = { ...fields, populate: async () => doc };
  return doc;
};

// mock.method infers the mocked method's own overload, so `arguments` is often
// typed as a zero-length tuple.
export const callArgs = (
  fn: { mock: { calls: readonly { arguments: unknown }[] } },
  index = 0,
): unknown[] => fn.mock.calls[index].arguments as unknown[];
