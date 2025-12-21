import * as fs from 'node:fs';
import ipc from 'node-ipc';

import { IPC_EVENTS } from '../ipcEvents';
import { connectIPCClient } from './ipcClient';
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
 * Cypress plugin entrypoint for use in `setupNodeEvents(on, config)`.
 *
 * Note: we intentionally type `on`/`config` as `any` to keep this package free of a hard
 * dependency on Cypress types.
 */
function registerOrangebeardPlugin(
  on: any,
  config: any,
  callbacks?: OrangebeardPluginCallbacks,
): void {
  connectIPCClient(config);

  on('task', {
    orangebeard_log(log: any) {
      (ipc as any).of.orangebeard.emit(IPC_EVENTS.LOG, log);
      return null;
    },

    orangebeard_step(step: any) {
      (ipc as any).of.orangebeard.emit(IPC_EVENTS.COMMAND_STEP, step);
      return null;
    },
  });

  on('after:screenshot', (screenshotInfo: any) => {
    let logMessage: string | undefined;

    if (callbacks?.screenshotLogFn && typeof callbacks.screenshotLogFn === 'function') {
      logMessage = callbacks.screenshotLogFn(screenshotInfo);
    }

    (ipc as any).of.orangebeard.emit(IPC_EVENTS.SCREENSHOT, {
      logMessage,
      screenshotInfo,
    });

    return null;
  });

  // Cypress >= 10
  on('after:spec', (spec: any, results: any) => {
    (ipc as any).of.orangebeard.emit(IPC_EVENTS.SPEC_ARTIFACTS, {
      spec,
      results,
    });

    return null;
  });

  // Keep Cypress running until the listener has finished sending its async events.
  // Without this, Cypress may exit before reporter-side file IO + Orangebeard client flush completes.
  on('after:run', async () => {
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
  });
}

// Preserve CommonJS export style for existing Cypress configs
export = registerOrangebeardPlugin;
