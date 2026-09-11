import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { PoolClient } from 'pg';
import { hasDashboardTasks } from '../src/lib/dashboard-data';

test('dashboard reads the aliased existence result before deciding to regenerate', async () => {
  const calls: { text: string; values?: unknown[] }[] = [];
  const client = {
    async query(text: string, values?: unknown[]) {
      calls.push({ text, values });
      return { rows: [{ exists: true }] };
    },
  };

  assert.equal(await hasDashboardTasks(client as unknown as Pick<PoolClient, 'query'>, '2026-09-11'), true);
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0].values, ['2026-09-11']);
  assert.match(calls[0].text, /as exists\s*$/i);
});
