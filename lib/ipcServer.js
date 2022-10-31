const ipc = require('node-ipc').default;

const startIPCServer = (subscribeServerEvents, unsubscribeServerEvents) => {
  if (ipc.server) {
    unsubscribeServerEvents(ipc.server);
    subscribeServerEvents(ipc.server);
    return;
  }
  
  ipc.config.id = 'orangebeard';
  ipc.config.retry = 1500;
  ipc.config.silent = true;

  ipc.serve(() => {
    ipc.server.on('socket.disconnected', (socket, destroyedSocketID) => {
      ipc.log(`client ${destroyedSocketID} has disconnected!`);
    });
    ipc.server.on('destroy', () => {
      ipc.log('server destroyed');
    });
    subscribeServerEvents(ipc.server);
    process.on('exit', () => {
      unsubscribeServerEvents(ipc.server);
      ipc.server.stop();
    });
  });
  ipc.server.start();
};

module.exports = { startIPCServer };