'use strict';

const Mocha = require('mocha');
const OrangebeardClient = require('@orangebeard-io/javascript-client');
const fs = require('fs');
const path = require('path');
const glob = require('glob');

const {
    EVENT_RUN_BEGIN,
    EVENT_RUN_END,
    EVENT_TEST_BEGIN,
    EVENT_TEST_PASS,
    EVENT_TEST_FAIL,
    EVENT_TEST_PENDING,
    EVENT_SUITE_BEGIN,
    EVENT_SUITE_END,
    EVENT_HOOK_BEGIN,
    EVENT_HOOK_END,
} = Mocha.Runner.constants;

const { startIPCServer } = require('./ipcServer');

const utils = require('./utils.js');
const { IPC_EVENTS } = require('./ipcEvents');

const {
    status,
    level,
    testEntity,
    hookToTestEntity,
} = require('./constants.js');
const { getTotalSpecs } = require('./utils.js');

//dbg
const { parse, stringify, toJSON, fromJSON } = require('flatted');

/**
 * Basic error handler for promises. Just prints errors.
 *
 * @param {Object} err Promise's error
 */
const errorHandler = (err) => {
    if (err) {
        console.error(err);
    }
};

const createLockFile = (tempId) => {
    let lockfiles = glob.sync('orangebeard-*.lock');
    if (lockfiles.length > 0) {
        console.warn(`Previous lock file(s) present :${lockfiles}. Is another test run still in progress?`)
    }
    OrangebeardCypressListener.lockFileName = `orangebeard-${tempId}.lock`;
    fs.writeFileSync(OrangebeardCypressListener.lockFileName, '');
};

const deleteLockFile = (filename) => {
    fs.unlinkSync(filename);
};

// this reporter outputs test results to Orangebeard
class OrangebeardCypressListener extends Mocha.reporters.Base {

    async startTestRun() {
        OrangebeardCypressListener.testRun = OrangebeardCypressListener.client.startLaunch(utils.getStartTestRun(this.options));
        createLockFile(OrangebeardCypressListener.testRun.tempId)
        await OrangebeardCypressListener.testRun.promise;
    }

    static numberOfRuns() {
        if (OrangebeardCypressListener.totalNumberOfRuns > 0) {
            return;
        }
        OrangebeardCypressListener.totalNumberOfRuns = getTotalSpecs(OrangebeardCypressListener.cypressConfig);
    }

    constructor(runner, configuration) {
        super(runner);
        this.runner = runner;
        if (!OrangebeardCypressListener.client) {
            OrangebeardCypressListener.client = !Object.keys(configuration.reporterOptions).length
                ? new OrangebeardClient()
                : new OrangebeardClient(utils.getOrangebeardClientSettings(configuration));

            OrangebeardCypressListener.configuration = configuration;
            this.options = configuration.reporterOptions;
        }

        const configListener = (cypressFullConfig) => {
            OrangebeardCypressListener.cypressConfig = cypressFullConfig;
            OrangebeardCypressListener.numberOfRuns();
        };

        OrangebeardCypressListener.currentRun += 1;

        startIPCServer(
            (server) => {
                server.on(IPC_EVENTS.CONFIG, configListener);
            },
            (server) => {
                server.off(IPC_EVENTS.CONFIG, '*');
            },
        );



        this.runner.on(EVENT_RUN_BEGIN, () => {
            if (OrangebeardCypressListener.currentRun === 1) {
                this.startTestRun();
            } else {
                OrangebeardCypressListener.testRun = OrangebeardCypressListener.client.startLaunch({ id: OrangebeardCypressListener.client.launchUuid });
            }

        });

        this.runner.on(EVENT_SUITE_BEGIN, (suite) => {
            if (!suite.title && !suite.file) return;
            const suiteName = suite.title || suite.file.replace('cypress' + path.sep + 'e2e' + path.sep, '').replaceAll(path.sep, ' > ');
            const newSuite = OrangebeardCypressListener.client.startTestItem(
                {
                    type: 'SUITE',
                    name: suiteName,
                },
                OrangebeardCypressListener.testRun.tempId,
                suite.isRoot ? null : this.getCurrentSuiteTempId(),
            );

            newSuite.promise.catch(errorHandler);

            OrangebeardCypressListener.activeSuites.push({
                tempId: newSuite.tempId,
                name: suiteName,
            });
        });

        this.runner.on(EVENT_SUITE_END, (suite) => {
            if (!suite.title && !suite.file) return;
            const currentSuiteTempId = this.getCurrentSuiteTempId();
            const currentSuiteStatus = OrangebeardCypressListener.activeSuites[OrangebeardCypressListener.activeSuites.length - 1].status || status.PASSED;
            OrangebeardCypressListener.client.finishTestItem(currentSuiteTempId, currentSuiteStatus).promise.catch(errorHandler);
            OrangebeardCypressListener.activeSuites.pop();
        });

        this.runner.on(EVENT_TEST_BEGIN, (test) => {
            this.startItem(test, 'TEST', this.getCurrentSuiteTempId());
        });

        this.runner.on(EVENT_TEST_PASS, (test) => {
            const currentTest = OrangebeardCypressListener.activeTests[OrangebeardCypressListener.activeTests.length - 1]
            this.logMessage(currentTest.tempId, test.body, level.INFO)
            this.finishItem(currentTest.tempId, status.PASSED);
            OrangebeardCypressListener.activeTests.pop();
        });

        this.runner.on(EVENT_TEST_FAIL, (test, err) => {
            OrangebeardCypressListener.failedCount += 1;
            OrangebeardCypressListener.activeSuites.forEach(
                (suite) =>
                (OrangebeardCypressListener.activeSuites[OrangebeardCypressListener.activeSuites.findIndex((s) => s == suite)].status =
                    status.FAILED),
            );

            //If no current test exists, initialization (beforeAll) failed. Start test item before sending log
            if (OrangebeardCypressListener.activeTests.length < 1) {
                console.warn('TEST_FAIL received before TEST_BEGIN. Force starting test..')
                this.startItem(test, 'BEFORE', this.getCurrentSuiteTempId());
            }

            const currentTest = OrangebeardCypressListener.activeTests[OrangebeardCypressListener.activeTests.length - 1];

            this.logMessage(currentTest.tempId, test.body, level.INFO);

            const screenshot = utils.getFailedScreenshot(test.title);
            this.logMessage(currentTest.tempId, this.parseErrorLog(err), level.ERROR, screenshot);
            this.finishItem(currentTest.tempId, status.FAILED);
            OrangebeardCypressListener.activeTests.pop();
        });

        this.runner.on(EVENT_TEST_PENDING, (test) => {
            const currentTest = OrangebeardCypressListener.activeTests[OrangebeardCypressListener.activeTests.length - 1]
            this.logMessage(currentTest.tempId, test.body, level.INFO)
            this.finishItem(currentTest.tempId, status.SKIPPED);
            OrangebeardCypressListener.activeTests.pop();
        });

        this.runner.on(EVENT_RUN_END, () => {
            if (OrangebeardCypressListener.currentRun == OrangebeardCypressListener.totalNumberOfRuns) {
                const finishRunPromise = OrangebeardCypressListener.client.finishLaunch(OrangebeardCypressListener.testRun.tempId, {
                    status: OrangebeardCypressListener.failedCount > 0 ? status.FAILED : status.PASSED,
                }).promise;

                finishRunPromise.then(() => deleteLockFile(OrangebeardCypressListener.lockFileName));
            }

        });

        this.runner.on(EVENT_HOOK_BEGIN, (hook) => {
            let activeItemArray = OrangebeardCypressListener.activeTests;
            let parentTempId = this.getCurrentSuiteTempId();
            let hookType = hook.hookName.startsWith('before') ? 'BEFORE_METHOD' : 'AFTER_METHOD';

            if (hook.hookName.startsWith('before each') || hook.hookName.startsWith('after each')) {
                activeItemArray = OrangebeardCypressListener.activeSteps;
                parentTempId = OrangebeardCypressListener.activeTests[OrangebeardCypressListener.activeTests.length - 1].tempId;
                hookType = 'STEP';
            }
            
            if (activeItemArray.find(s => { return s.cyId == hook.hookId }) !== undefined) {
                return;
            }
            
            const newItem = this.startItem(hook, hookType, parentTempId);
            this.logMessage(newItem.tempId, hook.body, level.INFO)
        });

        this.runner.on(EVENT_HOOK_END, (hook) => {
            const activeItemArray = hook.hookName.startsWith('before each') || hook.hookName.startsWith('after each') ?
                OrangebeardCypressListener.activeSteps : OrangebeardCypressListener.activeTests;

            if (activeItemArray.length == 0) {
                return;
            }

            const currentItem = activeItemArray[activeItemArray.length - 1]

            if (hook.status == 'failed') {
                this.logMessage(currentItem.tempId, hook.err, level.ERROR)
            }

            this.finishItem(currentItem.tempId, hook.status);
            activeItemArray.pop();
        });

    }

    //helpers
    getCurrentSuiteTempId() {
        return OrangebeardCypressListener.activeSuites.length ?
            OrangebeardCypressListener.activeSuites[OrangebeardCypressListener.activeSuites.length - 1].tempId : null;
    }

    parseErrorLog(err) {
        if (err.codeFrame) {
            return `[${err.name}:${err.type}] ${err.message}
        
File: ${err.codeFrame.relativeFile || 'unknown file'}

Reference (ln ${err.codeFrame.line}, col ${err.codeFrame.column}):

${err.codeFrame.frame}`;
        }
        else {
            return `[${err.name}:${err.type}] ${err.message} Code Frame not present. Raw error:${err}`
        }
    }

    logMessage(id, value, logLevel, screenshot) {
        OrangebeardCypressListener.client
            .sendLog(
                id,
                {
                    level: logLevel,
                    message: value,
                    time: new Date().valueOf(),
                },
                screenshot,
            ).promise.catch(errorHandler);
    }

    startItem(test, type, parent) {
        const newItem = OrangebeardCypressListener.client.startTestItem(
            {
                name: test.title,
                type: type,
                hasStats: type != 'STEP',
            },
            OrangebeardCypressListener.testRun.tempId,
            parent,
        );
        newItem.promise.catch(errorHandler);

        const activeItemArray = type == 'STEP' ? OrangebeardCypressListener.activeSteps : OrangebeardCypressListener.activeTests;
        activeItemArray.push(
            {
                parent: parent,
                tempId: newItem.tempId,
                name: newItem.title,
                cyId: test.hookId || ''
            });

        return newItem;
    }

    finishItem(itemId, itemStatus) {
        OrangebeardCypressListener.client.finishTestItem(itemId, {
            status: itemStatus,
        }).promise.catch(errorHandler);
    }
}


OrangebeardCypressListener.currentRun = 0;
OrangebeardCypressListener.totalNumberOfRuns = 0;
OrangebeardCypressListener.testRun;
OrangebeardCypressListener.activeSuites = [];
OrangebeardCypressListener.activeTests = [];
OrangebeardCypressListener.activeSteps = [];
OrangebeardCypressListener.client;
OrangebeardCypressListener.failedCount = 0;
OrangebeardCypressListener.lockFileName;

module.exports = OrangebeardCypressListener;