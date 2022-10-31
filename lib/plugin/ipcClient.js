const ipc = require('node-ipc').default;
const { IPC_EVENTS } = require('./../ipcEvents');

const connectIPCClient = (config) => {
    
    ipc.config.id = 'orangebeard';
    ipc.config.retry = 1500;
    ipc.config.silent = true;

    ipc.connectTo('orangebeard', () => {
        ipc.of.orangebeard.on('connect', () => {
            ipc.log('Orangebeard connected');
            ipc.of.orangebeard.emit(IPC_EVENTS.CONFIG, config);
        });
        ipc.of.orangebeard.on('disconnect', () => {
            ipc.log('Orangebeard disconnected');
        });
    });
};

module.exports = { connectIPCClient };