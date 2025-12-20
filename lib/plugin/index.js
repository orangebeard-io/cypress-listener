const ipc = require('node-ipc').default;
const { connectIPCClient } = require('./ipcClient');
const { IPC_EVENTS } = require('./../ipcEvents');

const registerOrangebeardPlugin = (on, config, callbacks) => {
    connectIPCClient(config);

    on('task', {
        orangebeard_log(log) {
            ipc.of.orangebeard.emit(IPC_EVENTS.LOG, log);
            return null;
        }
    });

    on('after:screenshot', (screenshotInfo) => {
        let logMessage;
        if (callbacks && callbacks.screenshotLogFn && typeof callbacks.screenshotLogFn === 'function') {
            logMessage = callbacks.screenshotLogFn(screenshotInfo);
        }
        ipc.of.orangebeard.emit(IPC_EVENTS.SCREENSHOT, {
            logMessage,
            screenshotInfo,
        });
        return null;
    });
};

module.exports = registerOrangebeardPlugin;
