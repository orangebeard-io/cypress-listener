export type OrangebeardLogPayload = {
  level: 'debug' | 'info' | 'warn' | 'error';
  message: string;
};

/**
 * Register a minimal integration that forwards `cy.log(...)` to the Orangebeard reporter.
 *
 * Usage (in your Cypress support file):
 *   import { registerOrangebeardCommands } from '@orangebeard-io/cypress-listener/commands'
 *   registerOrangebeardCommands()
 */
export function registerOrangebeardCommands(): void {
  const CypressAny = (globalThis as any).Cypress;
  if (!CypressAny?.Commands?.overwrite) {
    // Not running inside Cypress browser context.
    return;
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
