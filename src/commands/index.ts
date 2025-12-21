export type OrangebeardLogPayload = {
  level: 'debug' | 'info' | 'warn' | 'error';
  message: unknown;
};

export type OrangebeardCommandStepPayload = {
  event: 'start' | 'finish';
  commandId: string;
  commandName?: string;
  message?: string;
  state?: 'passed' | 'failed' | 'skipped' | string;
  testFullTitle?: string;
  wallClockStartedAt?: number;
  wallClockEndedAt?: number;
};

export type RegisterOrangebeardCommandsOptions = {
  captureCypressCommandSteps?: boolean;
};

function normalizeCypressLogArgs(...args: any[]): any {
  // Cypress event handlers often provide (attrs, log) or just (log)
  for (const a of args) {
    if (a && typeof a === 'object' && typeof a.id === 'string') return a;
  }
  return args[0];
}

function getCurrentTestFullTitle(): string | undefined {
  try {
    const cyAny = (globalThis as any).cy;
    const runnable = cyAny?.state?.('runnable');
    const fullTitle = runnable?.fullTitle?.();
    if (typeof fullTitle === 'string' && fullTitle.trim()) return fullTitle.trim();
  } catch {
    // ignore
  }
  return undefined;
}

function registerCommandStepCapture(): void {
  const CypressAny = (globalThis as any).Cypress;
  const cyAny = (globalThis as any).cy;
  if (!CypressAny?.on || !cyAny?.task) return;

  const started = new Set<string>();
  const finished = new Set<string>();

  CypressAny.on('log:added', (...args: any[]) => {
    const log = normalizeCypressLogArgs(...args);
    const id = log?.id;
    if (typeof id !== 'string' || !id) return;

    // Don't create steps for our own forwarding tasks.
    if (log?.name === 'task' && String(log?.message ?? '').includes('orangebeard_')) return;

    if (started.has(id)) return;
    started.add(id);

    cyAny.task('orangebeard_step', {
      event: 'start',
      commandId: id,
      commandName: log?.name,
      message: log?.message,
      testFullTitle: getCurrentTestFullTitle(),
      wallClockStartedAt: log?.wallClockStartedAt,
    } satisfies OrangebeardCommandStepPayload);
  });

  CypressAny.on('log:changed', (...args: any[]) => {
    const log = normalizeCypressLogArgs(...args);
    const id = log?.id;
    if (typeof id !== 'string' || !id) return;

    if (!started.has(id)) {
      // Some Cypress versions may skip log:added for certain events.
      started.add(id);
      cyAny.task('orangebeard_step', {
        event: 'start',
        commandId: id,
        commandName: log?.name,
        message: log?.message,
        testFullTitle: getCurrentTestFullTitle(),
        wallClockStartedAt: log?.wallClockStartedAt,
      } satisfies OrangebeardCommandStepPayload);
    }

    if (finished.has(id)) return;

    const state = log?.state;
    const isDone = state === 'passed' || state === 'failed' || state === 'skipped';
    if (!isDone) return;

    finished.add(id);

    cyAny.task('orangebeard_step', {
      event: 'finish',
      commandId: id,
      commandName: log?.name,
      message: log?.message,
      state,
      testFullTitle: getCurrentTestFullTitle(),
      wallClockEndedAt: log?.wallClockEndedAt,
    } satisfies OrangebeardCommandStepPayload);
  });
}

/**
 * Register a minimal integration that forwards `cy.log(...)` to the Orangebeard reporter.
 *
 * Usage (in your Cypress support file):
 *   import { registerOrangebeardCommands } from '@orangebeard-io/cypress-listener/commands'
 *   registerOrangebeardCommands()
 */
export function registerOrangebeardCommands(options: RegisterOrangebeardCommandsOptions = {}): void {
  const CypressAny = (globalThis as any).Cypress;
  if (!CypressAny?.Commands?.overwrite) {
    // Not running inside Cypress browser context.
    return;
  }

  const capture = options.captureCypressCommandSteps ?? true;
  if (capture) {
    registerCommandStepCapture();
  }

  CypressAny.Commands.overwrite('log', (originalFn: (...args: any[]) => any, ...args: any[]) => {
    const message = args.reduce((result: string, logItem: any) => {
      if (typeof logItem === 'object') {
        try {
          return [result, JSON.stringify(logItem)].join(' ');
        } catch {
          return [result, String(logItem)].join(' ');
        }
      }

      return [result, logItem ? logItem.toString() : ''].join(' ');
    }, '');

    // Forward to the plugin process.
    (globalThis as any).cy?.task?.('orangebeard_log', {
      level: 'info',
      message,
    } satisfies OrangebeardLogPayload);

    return originalFn(...args);
  });
}
