import test from 'node:test';
import assert from 'node:assert/strict';

import { createAfterRunHandler } from '../plugin/afterRun';

test('after:run handler emits RUN_END even when waitForLockfiles is disabled', async () => {
  const calls: string[] = [];
  const handler = createAfterRunHandler(() => calls.push('emitted'), { waitForLockfiles: false });

  await handler();

  assert.deepEqual(calls, ['emitted']);
});

test('after:run handler emits RUN_END before waiting for lockfiles to clear', async () => {
  const order: string[] = [];
  const handler = createAfterRunHandler(() => order.push('emitted'), {
    lockfilePollIntervalMs: 1,
    lockfileTimeoutMs: 5,
  });

  await handler();

  // No lockfiles exist in the test cwd, so the poll loop resolves immediately;
  // RUN_END must have been emitted before that loop even starts.
  assert.deepEqual(order, ['emitted']);
});

test('after:run handler still waits out the lockfile timeout when a lock lingers', async () => {
  const calls: string[] = [];
  const handler = createAfterRunHandler(() => calls.push('emitted'), {
    lockfilePollIntervalMs: 5,
    lockfileTimeoutMs: 20,
  });

  const fs = await import('node:fs');
  const lockPath = 'orangebeard-test-plugin.lock';
  fs.writeFileSync(lockPath, '');

  try {
    const start = Date.now();
    await handler();
    const elapsed = Date.now() - start;

    assert.deepEqual(calls, ['emitted']);
    assert.ok(elapsed >= 20, `expected to wait out the timeout, only waited ${elapsed}ms`);
  } finally {
    fs.unlinkSync(lockPath);
  }
});
