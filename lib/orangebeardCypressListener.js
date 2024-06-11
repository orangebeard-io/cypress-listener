'use strict';

const Mocha = require('mocha');
const OrangebeardAsyncV3Client = require('@orangebeard-io/javascript-client');
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
const {startIPCServer} = require('./ipcServer');
const utils = require('./utils.js');
const {IPC_EVENTS} = require('./ipcEvents');
const {
    status,
    level,
} = require('./constants.js');
const {getTotalSpecs} = require('./utils.js');
const {testEntity} = require("./constants");

// this reporter outputs test results to Orangebeard
class OrangebeardCypressListener extends Mocha.reporters.Base {

    startTestRun() {
        OrangebeardCypressListener.testRun = OrangebeardCypressListener.client.startTestRun(utils.getStartTestRun(this.options))
        createLockFile(OrangebeardCypressListener.testRun)
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
                ? new OrangebeardAsyncV3Client()
                : new OrangebeardAsyncV3Client(utils.getOrangebeardClientSettings(configuration));

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
            }
        });

        this.runner.on(EVENT_SUITE_BEGIN, (suite) => {
            if (!suite.title && !suite.file) return;
            if (suite.file) {
                OrangebeardCypressListener.activeSpec = suite.file.replace('cypress' + path.sep + 'e2e' + path.sep, '');
            }
            const suiteName = suite.title || suite.file.replace('cypress' + path.sep + 'e2e' + path.sep, '').replaceAll(path.sep, ' > ');

            const newSuite = OrangebeardCypressListener.client.startSuite({
                testRunUUID: OrangebeardCypressListener.testRun,
                parentSuiteUUID: suite.isRoot ? null : this.getCurrentSuiteTempId(),
                suiteNames: [suiteName],
            });

            OrangebeardCypressListener.activeSuites.push({
                tempId: newSuite[0],
                name: suiteName,
            });
        });

        this.runner.on(EVENT_SUITE_END, (suite) => {
            if (!suite.title && !suite.file) return;

            OrangebeardCypressListener.previousSuite = OrangebeardCypressListener.activeSuites.pop();
        });

        this.runner.on(EVENT_TEST_BEGIN, (test) => {
            this.startTest(test, testEntity.TEST);
        });

        this.runner.on(EVENT_TEST_PASS, (test) => {
            this.finishTest(test);
        });

        this.runner.on(EVENT_TEST_FAIL, async (test, err) => {

            //If no current test exists, initialization (beforeAll) failed. Start test item before sending log
            if (OrangebeardCypressListener.activeTests.length < 1) {
                console.warn('TEST_FAIL received before TEST_BEGIN. Force starting test..');
                this.startTest(test, testEntity.BEFORE);
            }

            const screenshot = await utils.getFailedScreenshot(test.title);


            //this.logMessage(this.getCurrentTestTempId(), this.parseErrorLog(err), level.ERROR, screenshot);
            const logId = this.logMessage(this.getCurrentTestTempId(), this.parseErrorLog(err), level.ERROR);
            this.logScreenshot(this.getCurrentTestTempId(), logId, screenshot);
            this.finishTest(test);
        });

        this.runner.on(EVENT_TEST_PENDING, (test) => {
            this.finishTest(test, true);
        });

        this.runner.on(EVENT_RUN_END, async () => {

            // optional after with video?
            if (OrangebeardCypressListener.configuration.reporterOptions.reportVideo) {
                const videoFolder = OrangebeardCypressListener.cypressConfig.videosFolder;
                const videoFile = OrangebeardCypressListener.activeSpec + ".mp4";
                OrangebeardCypressListener.videos.push({
                    folder: videoFolder,
                    file: videoFile,
                    suiteId: OrangebeardCypressListener.previousSuite.tempId,
                });
            }

            if (OrangebeardCypressListener.currentRun === OrangebeardCypressListener.totalNumberOfRuns) {

                if (OrangebeardCypressListener.configuration.reporterOptions.reportVideo) {
                    for (const video of OrangebeardCypressListener.videos) {
                        const videoAttachment = await utils.getVideo(video.folder, video.file);
                        const videoItemId = OrangebeardCypressListener.client.startTest({
                            testRunUUID: OrangebeardCypressListener.testRun,
                            suiteUUID: video.suiteId,
                            testName: "Video recording",
                            testType: "AFTER",
                            startTime: utils.getTime(),
                        });

                        const logId = this.logMessage(videoItemId, "Video recording", 'INFO');
                        this.logScreenshot(videoItemId, logId, videoAttachment);

                        OrangebeardCypressListener.client.finishTest(videoItemId, {
                            testRunUUID: OrangebeardCypressListener.testRun,
                            status: status.PASSED,
                            endTime: utils.getTime(),
                        });
                    }
                }
                await OrangebeardCypressListener.client.finishTestRun(OrangebeardCypressListener.testRun, {
                    endTime: utils.getTime(),
                });
                deleteLockFile(OrangebeardCypressListener.lockFileName);
            }
        });

        this.runner.on(EVENT_HOOK_BEGIN, (hook) => {
            let isTest = true;
            let activeItemArray = OrangebeardCypressListener.activeTests;
            let hookType = hook.hookName.startsWith('before') ? testEntity.BEFORE : testEntity.AFTER;

            if (hook.hookName.startsWith('before each') || hook.hookName.startsWith('after each')) {
                isTest = false; //report a step
                activeItemArray = OrangebeardCypressListener.activeSteps;
            }

            if (activeItemArray.find(s => {
                return s.cyId === hook.id
            }) === undefined) {
                isTest ? this.startTest(hook, hookType) : this.startStep(hook);
            }

        });

        this.runner.on(EVENT_HOOK_END, (hook) => {
            let isTest = !(hook.hookName.startsWith('before each') || hook.hookName.startsWith('after each'));

            if (isTest) {
                if (hook.status === 'failed') {
                    this.logMessage(this.getCurrentTestTempId(), hook.err, level.ERROR);
                }
                this.finishTest(hook);
            } else {
                if (hook.status === 'failed') {
                    this.logMessage(this.getCurrentStepTempId(), hook.err, level.ERROR);
                }
                this.finishStep(hook, this.getCurrentStepTempId());
            }
        });
    }

    //helpers
    getCurrentSuiteTempId() {
        return OrangebeardCypressListener.activeSuites.length ?
            OrangebeardCypressListener.activeSuites[OrangebeardCypressListener.activeSuites.length - 1].tempId : null;
    }

    getCurrentTestTempId() {
        return OrangebeardCypressListener.activeTests.length ?
            OrangebeardCypressListener.activeTests[OrangebeardCypressListener.activeTests.length - 1].tempId : null;
    }

    getCurrentStepTempId() {
        return OrangebeardCypressListener.activeSteps.length ?
            OrangebeardCypressListener.activeSteps[OrangebeardCypressListener.activeSteps.length - 1].tempId : null;
    }

    parseErrorLog(err) {
        if (err.codeFrame) {
            return `[${err.name}:${err.type}] ${err.message}
        
File: ${err.codeFrame.relativeFile || 'unknown file'}

Reference (ln ${err.codeFrame.line}, col ${err.codeFrame.column}):

${err.codeFrame.frame}`;
        } else {
            return `[${err.name}:${err.type}] ${err.message} Code Frame not present. Raw error:${err}`
        }
    }

    logMessage(testId, message, logLevel, stepId = undefined) {
        const logItem = {
            testRunUUID: OrangebeardCypressListener.testRun,
            testUUID: testId,
            stepUUID: stepId !== undefined ? stepId : undefined,
            logTime: utils.getTime(),
            message,
            logLevel: logLevel,
            logFormat: 'PLAIN_TEXT',
        }

        return OrangebeardCypressListener.client.log(logItem);
    }

    logScreenshot(testId, logId, screenshot, stepId = undefined) {
        OrangebeardCypressListener.client.sendAttachment({
            file: screenshot,
            metaData: {
                testRunUUID: OrangebeardCypressListener.testRun,
                testUUID: testId,
                logUUID: logId,
                stepUUID: stepId !== undefined ? stepId : undefined,
                attachmentTime: utils.getTime()
            }
        });
    }

    startTest(test, type) {
        const parent = this.getCurrentSuiteTempId();

        if (parent != null) {
            const newTest = OrangebeardCypressListener.client.startTest({
                testRunUUID: OrangebeardCypressListener.testRun,
                suiteUUID: parent,
                testName: test.title,
                testType: type,
                startTime: utils.getTime(),
            });

            this.logMessage(newTest, test.body, level.INFO);

            OrangebeardCypressListener.activeTests.push({
                parent: parent,
                tempId: newTest,
                name: test.title,
                cyId: test.id || ''
            });
            return newTest;
        }
    }

    finishTest(test, skipped = false) {
        let unclosedChild;
        while ((unclosedChild = OrangebeardCypressListener.activeSteps.find(o => o.parent === this.getCurrentTestTempId())) !== undefined) {
            this.finishStep({status: 'STOPPED'}, unclosedChild.tempId);
        }

        OrangebeardCypressListener.client.finishTest(this.getCurrentTestTempId(), {
            testRunUUID: OrangebeardCypressListener.testRun,
            status: skipped ? status.SKIPPED : test.state === 'failed' ? status.FAILED : status.PASSED,
            endTime: utils.getTime(),
        });
        OrangebeardCypressListener.activeTests.pop();
    }

    startStep(step) {
        const parentTest = this.getCurrentTestTempId();

        if (parentTest != null) {
            const newStep = OrangebeardCypressListener.client.startStep({
                testRunUUID: OrangebeardCypressListener.testRun,
                testUUID: parentTest,
                stepName: step.title,
                startTime: utils.getTime(),
            });

            this.logMessage(parentTest, step.body, level.INFO, newStep);

            OrangebeardCypressListener.activeSteps.push({
                parent: parentTest,
                tempId: newStep,
                name: step.title,
                cyId: step.id || ''
            });
            return newStep;
        }
    }

    finishStep(step, stepTempId) {
        OrangebeardCypressListener.client.finishStep(stepTempId, {
            testRunUUID: OrangebeardCypressListener.testRun,
            status: step.status === 'failed' ? status.FAILED : status.PASSED,
            endTime: utils.getTime(),
        });
        this.removeStepsWithId(stepTempId);
    }

    removeStepsWithId(id) {
        for (let i = OrangebeardCypressListener.activeSteps.length - 1; i >= 0; i--) {
            if (OrangebeardCypressListener.activeSteps[i].tempId === id) {
                OrangebeardCypressListener.activeSteps.splice(i, 1);
            }
        }
    }
}

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

OrangebeardCypressListener.currentRun = 0;
OrangebeardCypressListener.totalNumberOfRuns = 0;
OrangebeardCypressListener.testRun;
OrangebeardCypressListener.activeSuites = [];
OrangebeardCypressListener.activeTests = [];
OrangebeardCypressListener.activeSteps = [];
OrangebeardCypressListener.client = null;
OrangebeardCypressListener.lockFileName = null;
OrangebeardCypressListener.activeSpec = null;
OrangebeardCypressListener.previousSuite = null;
OrangebeardCypressListener.videos = [];

module.exports = OrangebeardCypressListener;
