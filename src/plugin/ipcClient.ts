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
  });
}
