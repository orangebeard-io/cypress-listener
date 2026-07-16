import ipc from 'node-ipc';

import { IPC_EVENTS } from '../ipcEvents';
import { connectIPCClient } from './ipcClient';
import { createAfterRunHandler } from './afterRun';
import type { OrangebeardPluginCallbacks } from './types';

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
  on(
    'after:run',
    createAfterRunHandler(
      () => (ipc as any).of.orangebeard.emit(IPC_EVENTS.RUN_END, {}),
      callbacks,
    ),
  );
}

// Preserve CommonJS export style for existing Cypress configs
export = registerOrangebeardPlugin;
