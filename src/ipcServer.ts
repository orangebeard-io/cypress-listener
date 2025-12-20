import ipc from 'node-ipc';

export type SubscribeFn = (server: any) => void;
export type UnsubscribeFn = (server: any) => void;

export function startIPCServer(subscribe: SubscribeFn, unsubscribe: UnsubscribeFn): void {
  // node-ipc keeps a singleton server; reuse across reporter instances.
  if ((ipc as any).server) {
    unsubscribe((ipc as any).server);
    subscribe((ipc as any).server);
    return;
  }

  (ipc as any).config.id = 'orangebeard';
  (ipc as any).config.retry = 1500;
  (ipc as any).config.silent = true;

  (ipc as any).serve(() => {
    (ipc as any).server.on('socket.disconnected', (_socket: any, destroyedSocketID: any) => {
      (ipc as any).log(`client ${destroyedSocketID} has disconnected!`);
    });

    (ipc as any).server.on('destroy', () => {
      (ipc as any).log('server destroyed');
    });

    subscribe((ipc as any).server);

    process.on('exit', () => {
      unsubscribe((ipc as any).server);
      (ipc as any).server.stop();
    });
  });

  (ipc as any).server.start();
}
