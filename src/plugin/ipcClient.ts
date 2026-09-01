import ipc from 'node-ipc';

import { IPC_EVENTS } from '../ipcEvents';

export function connectIPCClient(config: any): void {
  (ipc as any).config.id = 'orangebeard';
  (ipc as any).config.retry = 1500;
  (ipc as any).config.silent = true;

  (ipc as any).connectTo('orangebeard', () => {
    (ipc as any).of.orangebeard.on('connect', () => {
      (ipc as any).log('Orangebeard connected');
      (ipc as any).of.orangebeard.emit(IPC_EVENTS.CONFIG, config);
    });

    (ipc as any).of.orangebeard.on('disconnect', () => {
      (ipc as any).log('Orangebeard disconnected');
    });

    // Answered synchronously: by the time this handler runs, every LOG/COMMAND_STEP/
    // SCREENSHOT message this process has already emitted has already been written to the
    // same outgoing socket (JS is single-threaded, and those emits happen synchronously
    // inside Cypress's own task/hook callbacks). Since node-ipc preserves per-direction
    // message order on one connection, the reporter receiving this ack proves it has already
    // received (and dispatched the handler for) everything sent before it.
    (ipc as any).of.orangebeard.on(IPC_EVENTS.FLUSH, (payload: any) => {
      (ipc as any).of.orangebeard.emit(IPC_EVENTS.FLUSH_ACK, { id: payload?.id });
    });
  });
}
