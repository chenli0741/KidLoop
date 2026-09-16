import type { QueryResult, QueryResultRow } from 'pg';
// Match pg’s default untyped row shape; callers may supply an explicit row type.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type SqlReader = {query<T extends QueryResultRow = any>(sql:string,values?:unknown[]):Promise<QueryResult<T>>};
