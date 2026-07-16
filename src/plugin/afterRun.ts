import * as fs from 'node:fs';

import type { OrangebeardPluginCallbacks } from './types';

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function hasOrangebeardLockfiles(): boolean {
  try {
    return fs.readdirSync(process.cwd()).some((f) => /^orangebeard-.*\.lock$/i.test(f));
  } catch {
    return false;
  }
}

/**
 * Builds the `after:run` handler. Cypress guarantees `after:run` fires exactly once, after
 * every spec that was actually going to run in this `cypress run` process has finished -
 * unlike the reporter's own spec-count heuristic, this is unaffected by `--spec` subsets,
 * so it is the authoritative "all specs are done" signal.
 *
 * Split out (taking `emitRunEnd` as a parameter) so it is unit-testable without a real
 * node-ipc connection.
 */
export function createAfterRunHandler(
  emitRunEnd: () => void,
  callbacks?: OrangebeardPluginCallbacks,
): () => Promise<void> {
  return async () => {
    // Tell the reporter this is the last spec, regardless of whether its own spec-count
    // heuristic agrees (it won't, e.g. when running a `--spec` subset of the project).
    emitRunEnd();

    if (callbacks?.waitForLockfiles === false) return;

    const pollIntervalMs = callbacks?.lockfilePollIntervalMs ?? 500;
    const timeoutMs = callbacks?.lockfileTimeoutMs ?? 5 * 60_000;
    const startedAt = Date.now();

    while (hasOrangebeardLockfiles()) {
      if (timeoutMs > 0 && Date.now() - startedAt > timeoutMs) {
        // eslint-disable-next-line no-console
        console.warn(
          `[Orangebeard] Timeout waiting for lockfiles after ${timeoutMs}ms. Continuing Cypress shutdown.`,
        );
        break;
      }

      await delay(pollIntervalMs);
    }
  };
}
