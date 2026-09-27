import type { QueryResult, QueryResultRow } from 'pg';
// Match pg’s default untyped row shape; callers may supply an explicit row type.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type SqlReader = {query<T extends QueryResultRow = any>(sql:string,values?:unknown[]):Promise<QueryResult<T>>};

/**
 * PostgreSQL only permits one active query on a checked-out client. Some of the
 * scheduling readers intentionally fan out when backed by the pool-like `db`
 * adapter, but materialization passes a single transaction client. Queue those
 * reads so they stay in the same transaction without overlapping on the wire.
 */
export function serialSqlReader(reader: SqlReader): SqlReader {
 let tail: Promise<void> = Promise.resolve();
 return {
  query<T extends QueryResultRow = QueryResultRow>(sql:string,values?:unknown[]) {
   const result=tail.then(()=>reader.query<T>(sql,values));
   tail=result.then(()=>undefined,()=>undefined);
   return result;
  },
 };
}
