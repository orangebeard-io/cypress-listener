'use strict';

const Mocha = require('mocha');
const OrangebeardClient = require('@orangebeard-io/javascript-client');

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

// this reporter outputs test results to Orangebeard
class OrangebeardCypressListener extends Mocha.reporters.Base {

    async startTestRun() {
        OrangebeardCypressListener.testRun = OrangebeardCypressListener.client.startLaunch(utils.getStartTestRun(this.options));
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
            if (!suite.title) return;
            const newSuite = OrangebeardCypressListener.client.startTestItem(
                {
                    type: 'SUITE',
                    name: suite.title,
                },
                OrangebeardCypressListener.testRun.tempId,
                suite.isRoot ? null : this.getCurrentSuiteTempId(),
            );

            newSuite.promise.catch(errorHandler);

            OrangebeardCypressListener.activeSuites.push({
                tempId: newSuite.tempId,
                name: suite.title,
            });
        });

        this.runner.on(EVENT_SUITE_END, (suite) => {
            if (!suite.title) return;
            const currentSuiteTempId = this.getCurrentSuiteTempId();
            const currentSuiteStatus = OrangebeardCypressListener.activeSuites[OrangebeardCypressListener.activeSuites.length - 1].status || status.PASSED;
            OrangebeardCypressListener.client.finishTestItem(currentSuiteTempId, currentSuiteStatus).promise.catch(errorHandler);
            OrangebeardCypressListener.activeSuites.pop();
        });

        this.runner.on(EVENT_TEST_BEGIN, (test) => {
            const parentTempId = this.getCurrentSuiteTempId();
            const newTest = OrangebeardCypressListener.client.startTestItem(
                {
                    name: test.title,
                    type: 'TEST',
                },
                OrangebeardCypressListener.testRun.tempId,
                parentTempId,
            );
            newTest.promise.catch(errorHandler);

            OrangebeardCypressListener.activeTests.push({
                parent: parentTempId,
                tempId: newTest.tempId,
                name: newTest.title
            });
        });

        this.runner.on(EVENT_TEST_PASS, (test) => {
            const currentTest = OrangebeardCypressListener.activeTests[OrangebeardCypressListener.activeTests.length - 1]
            this.logMessage(currentTest.tempId, test.body, level.INFO)
            OrangebeardCypressListener.client.finishTestItem(currentTest.tempId, {
                status: status.PASSED,
            }).promise.catch(errorHandler);

            OrangebeardCypressListener.activeTests.pop();
        });

        this.runner.on(EVENT_TEST_FAIL, (test, err) => {
            console.log(stringify(test));

            OrangebeardCypressListener.failedCount += 1;
            OrangebeardCypressListener.activeSuites.forEach(
                (suite) =>
                (OrangebeardCypressListener.activeSuites[OrangebeardCypressListener.activeSuites.findIndex((s) => s == suite)].status =
                    status.FAILED),
            );

            const currentTest = OrangebeardCypressListener.activeTests[OrangebeardCypressListener.activeTests.length - 1];
            this.logMessage(currentTest.tempId, test.body, level.INFO);

            const screenshot = utils.getFailedScreenshot(test.title);
            this.logMessage(currentTest.tempId, this.parseErrorLog(err), level.ERROR, screenshot);

            OrangebeardCypressListener.client.finishTestItem(currentTest.tempId, {
                status: status.FAILED,
            }).promise.catch(errorHandler);

            OrangebeardCypressListener.activeTests.pop();
        });

        this.runner.on(EVENT_TEST_PENDING, (test) => {
            const currentTest = OrangebeardCypressListener.activeTests[OrangebeardCypressListener.activeTests.length - 1]
            this.logMessage(currentTest.tempId, test.body, level.INFO)
            OrangebeardCypressListener.client.finishTestItem(currentTest.tempId, {
                status: status.SKIPPED,
            }).promise.catch(errorHandler);

            OrangebeardCypressListener.activeTests.pop();
        });

        this.runner.on(EVENT_RUN_END, () => {
            if (OrangebeardCypressListener.currentRun == OrangebeardCypressListener.totalNumberOfRuns) {
                OrangebeardCypressListener.client.finishLaunch(OrangebeardCypressListener.testRun.tempId, {
                    status: OrangebeardCypressListener.failedCount > 0 ? status.FAILED : status.PASSED,
                }).promise.catch(errorHandler);
            }
        });

        this.runner.on(EVENT_HOOK_BEGIN, (hook) => {
            //TODO
        });

        this.runner.on(EVENT_HOOK_END, (hook) => {
            //TODO
        });

    }

    //helpers
    getCurrentSuiteTempId() {
        return OrangebeardCypressListener.activeSuites.length ?
            OrangebeardCypressListener.activeSuites[OrangebeardCypressListener.activeSuites.length - 1].tempId : null;
    }

    parseErrorLog(err) {
        return `[${err.name}:${err.type}] ${err.message}
        
File: ${err.codeFrame.relativeFile}

Reference (ln ${err.codeFrame.line}, col ${err.codeFrame.column}):

${err.codeFrame.frame}`;
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
}


OrangebeardCypressListener.currentRun = 0;
OrangebeardCypressListener.totalNumberOfRuns = 0;
OrangebeardCypressListener.testRun;
OrangebeardCypressListener.activeSuites = [];
OrangebeardCypressListener.activeTests = [];
OrangebeardCypressListener.activeSteps = [];
OrangebeardCypressListener.client;
OrangebeardCypressListener.failedCount = 0;

module.exports = OrangebeardCypressListener;