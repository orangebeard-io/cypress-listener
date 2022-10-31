const { connectIPCClient } = require('./ipcClient');

const registerOrangebeardPlugin = (on, config) => {
    connectIPCClient(config);
};

module.exports = registerOrangebeardPlugin;