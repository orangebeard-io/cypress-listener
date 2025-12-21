import { UUID } from 'crypto';
import * as path from 'node:path';

import Mocha from 'mocha';
import OrangebeardAsyncV3Client from '@orangebeard-io/javascript-client/dist/client/OrangebeardAsyncV3Client';
import type { Attachment } from '@orangebeard-io/javascript-client/dist/client/models/Attachment';

import { IPC_EVENTS } from '../ipcEvents';
import { startIPCServer } from '../ipcServer';
import { level, status, testEntity } from '../constants';
import { getBytes, getOrangebeardClientSettings, getStartTestRun, getTime, getTotalSpecs } from '../utils';
import { buildErrorLogs, formatAsMarkdownCodeBlock, formatAsMarkdownJson, normalizeIncomingLog } from './logging';
import { CommandStepTracker } from './commandStepTracker';
import { createLockFile, deleteLockFile } from './lockfile';
import { indexSpecSuite, normalizeSpecKey, resolveRootSuiteIdForSpec, type SpecSuiteIndex } from './specSuiteIndex';
import { indexTestName, resolveTestIdForNameKey, resolveTestIdForScreenshotPath, type TestNameIndex } from './testNameIndex';

type CypressReporterConfiguration = {
  reporterOptions?: Record<string, any>;
};

type ActiveItem = {
  parent?: UUID;
  tempId: UUID;
  name: string;
  cyId: string;
  fullName?: string | null;
};


// This reporter outputs test results to Orangebeard.
export default class OrangebeardCypressReporter extends Mocha.reporters.Base {
  private readonly options: Record<string, any>;

  // Reporter instance state (read mostly from statics)
  private readonly isParallel: boolean;
  private currentSpecKey: string | null = null;
  private readonly commandStepTracker: CommandStepTracker;

  constructor(runner: Mocha.Runner, configuration: CypressReporterConfiguration) {
    super(runner, configuration as any);

    this.options = configuration?.reporterOptions ?? {};

    this.commandStepTracker = new CommandStepTracker({
      isDisabled: () => OrangebeardCypressReporter.disabled,
      getTime,
      getTestRunUUID: () => OrangebeardCypressReporter.testRun!,
      getCurrentTestUUID: () => this.getCurrentTestTempId(),
      resolveTestIdForNameKey: (name: string) => resolveTestIdForNameKey(OrangebeardCypressReporter.testNameToUUID, name),
      startStep: (payload: any) => OrangebeardCypressReporter.client!.startStep(payload as any) as UUID,
      finishStep: (stepId: UUID, payload: any) => {
        OrangebeardCypressReporter.client!.finishStep(stepId, payload as any);
      },
      logMessage: (testId, message, logLevel, stepId, logFormat) =>
        this.logMessage(testId, message, logLevel, stepId ?? null, logFormat ?? 'PLAIN_TEXT'),
      formatAsMarkdownJson,
    });

    // parallel mode: join an existing run rather than creating/finishing it
    this.isParallel = Boolean(this.options.testRunUUID || this.options.parallelMode);

    // init singleton client/config once per process
    if (!OrangebeardCypressReporter.client) {
      OrangebeardCypressReporter.client =
        !Object.keys(this.options).length
          ? new OrangebeardAsyncV3Client()
          : new OrangebeardAsyncV3Client(getOrangebeardClientSettings(configuration));

      OrangebeardCypressReporter.configuration = configuration;
    }

    // Validate critical config once. If invalid, stop reporting entirely.
    if (!OrangebeardCypressReporter.disabled) {
      const resolvedTestset = this.resolveTestset();
      if (!resolvedTestset) {
        // eslint-disable-next-line no-console
        console.error(
          '[Orangebeard] Missing required configuration: testset. ' +
            'Set it via orangebeard.json (preferred), reporterOptions.testset, or ORANGEBEARD_TESTSET.',
        );
        OrangebeardCypressReporter.disabled = true;
      } else {
        OrangebeardCypressReporter.resolvedTestset = resolvedTestset;
      }
    }

    if (OrangebeardCypressReporter.disabled) {
      return;
    }

    // each reporter instance corresponds to a Cypress spec run
    OrangebeardCypressReporter.currentRun += 1;

    // receive plugin events (logs, screenshots, etc.) from browser-side Cypress runtime
    startIPCServer(
      (server) => {
        server.on(IPC_EVENTS.CONFIG, (cypressFullConfig: any) => {
          OrangebeardCypressReporter.cypressConfig = cypressFullConfig;
          OrangebeardCypressReporter.numberOfRuns();
        });

        server.on(IPC_EVENTS.LOG, (log: any) => {
          const testId = this.getCurrentTestTempId();
          if (!testId) return;

          const normalized = normalizeIncomingLog(log);
          this.logMessage(
            testId,
            normalized.message,
            normalized.level,
            this.getCurrentStepTempId(),
            normalized.logFormat,
          );
        });

        server.on(IPC_EVENTS.COMMAND_STEP, (evt: any) => {
          // Synchronous, but keep inflight contract consistent.
          this.track(Promise.resolve().then(() => this.commandStepTracker.handleEvent(evt)));
        });

        server.on(IPC_EVENTS.SCREENSHOT, (details: any) => {
          this.track(this.reportScreenshot(details));
        });

        server.on(IPC_EVENTS.SPEC_ARTIFACTS, (details: any) => {
          this.signalSpecArtifacts(details?.spec);
          this.track(this.reportSpecArtifacts(details));
        });
      },
      (server) => {
        server.off(IPC_EVENTS.CONFIG, '*');
        server.off(IPC_EVENTS.LOG, '*');
        server.off(IPC_EVENTS.COMMAND_STEP, '*');
        server.off(IPC_EVENTS.SCREENSHOT, '*');
        server.off(IPC_EVENTS.SPEC_ARTIFACTS, '*');
      },
    );

    this.runner.on(Mocha.Runner.constants.EVENT_RUN_BEGIN, () => {
      if (OrangebeardCypressReporter.currentRun !== 1) return;

      if (this.isParallel) {
        const provided = this.options.testRunUUID as string | undefined;
        if (!provided) {
          throw new Error('parallelMode requires reporterOptions.testRunUUID');
        }
        this.joinExistingRun(provided as unknown as UUID);
      } else {
        this.startTestRun();
      }
    });

    this.runner.on(Mocha.Runner.constants.EVENT_SUITE_BEGIN, (suite: any) => {
      if (!suite.title && !suite.file) return;

      if (suite.file) {
        // Keep a simple spec identifier for backwards compatibility.
        OrangebeardCypressReporter.activeSpec = suite.file.replace(
          `cypress${path.sep}e2e${path.sep}`,
          '',
        );
      }

      const suiteName =
        suite.title ||
        suite.file
          .replace(`cypress${path.sep}e2e${path.sep}`, '')
          .replaceAll(path.sep, ' > ');

      // In parallel mode, disambiguate suites from multiple runners.
      const runnerId = this.getRunnerId();
      const normalizedSuiteName =
        this.isParallel && suite.isRoot && runnerId ? `[${runnerId}] ${suiteName}` : suiteName;

      const newSuite = OrangebeardCypressReporter.client!.startSuite({
        testRunUUID: OrangebeardCypressReporter.testRun!,
        parentSuiteUUID: suite.isRoot ? null : this.getCurrentSuiteTempId(),
        suiteNames: [normalizedSuiteName],
      } as any);

      OrangebeardCypressReporter.activeSuites.push({
        tempId: newSuite[0],
        name: normalizedSuiteName,
        cyId: suite.id || '',
      });

      // Index the suite for this spec so `after:spec` can attach artifacts.
      // Do NOT rely on `suite.isRoot` (it is not stable across Cypress/Mocha versions).
      if (suite.file) {
        indexSpecSuite(OrangebeardCypressReporter.specSuites, newSuite[0], suite.file);
        this.currentSpecKey = normalizeSpecKey(suite.file);
        if (this.currentSpecKey) {
          this.ensureSpecArtifactsPromise(this.currentSpecKey);
        }

        // Also index the legacy computed activeSpec (often just the basename).
        if (OrangebeardCypressReporter.activeSpec) {
          indexSpecSuite(OrangebeardCypressReporter.specSuites, newSuite[0], OrangebeardCypressReporter.activeSpec);
        }
      }
    });

    this.runner.on(Mocha.Runner.constants.EVENT_SUITE_END, (suite: any) => {
      if (!suite.title && !suite.file) return;
      OrangebeardCypressReporter.previousSuite = OrangebeardCypressReporter.activeSuites.pop() || null;
    });

    this.runner.on(Mocha.Runner.constants.EVENT_TEST_BEGIN, (test: any) => {
      this.startTest(test, testEntity.TEST);
    });

    this.runner.on(Mocha.Runner.constants.EVENT_TEST_PASS, (test: any) => {
      this.finishTest(test);
    });

    this.runner.on(Mocha.Runner.constants.EVENT_TEST_FAIL, (test: any, err: any) => {
      this.track(
        (async () => {
          // If no current test exists, initialization (beforeAll) failed. Start item before sending log.
          if (OrangebeardCypressReporter.activeTests.length < 1) {
            // eslint-disable-next-line no-console
            console.warn('TEST_FAIL received before TEST_BEGIN. Force starting test..');
            this.startTest(test, testEntity.BEFORE);
          }

          const testId = this.getCurrentTestTempId();
          if (testId) {
            for (const entry of buildErrorLogs(err)) {
              this.logMessage(testId, entry.message, entry.level, null, entry.logFormat);
            }
          }

          // Do not attach screenshots here.
          // Cypress emits `after:screenshot` for failure screenshots; we attach them there using the real file path.

          this.finishTest(test);
        })(),
      );
    });

    this.runner.on(Mocha.Runner.constants.EVENT_TEST_PENDING, (test: any) => {
      this.finishTest(test, true);
    });

    this.runner.on(Mocha.Runner.constants.EVENT_HOOK_BEGIN, (hook: any) => {
      let isTest = true;
      let activeItemArray: ActiveItem[] = OrangebeardCypressReporter.activeTests;
      const hookType = hook.hookName?.startsWith('before') ? testEntity.BEFORE : testEntity.AFTER;

      if (hook.hookName?.startsWith('before each') || hook.hookName?.startsWith('after each')) {
        isTest = false; // report a step
        activeItemArray = OrangebeardCypressReporter.activeSteps;
      }

      if (activeItemArray.find((s) => s.cyId === hook.id) === undefined) {
        isTest ? this.startTest(hook, hookType) : this.startStep(hook);
      }
    });

    this.runner.on(Mocha.Runner.constants.EVENT_HOOK_END, (hook: any) => {
      const isTest = !(hook.hookName?.startsWith('before each') || hook.hookName?.startsWith('after each'));

      if (isTest) {
        if (hook.status === 'failed') {
          const testId = this.getCurrentTestTempId();
          if (testId) {
            for (const entry of buildErrorLogs(hook.err)) {
              this.logMessage(testId, entry.message, entry.level, null, entry.logFormat);
            }
          }
        }
        this.finishTest(hook);
      } else {
        if (hook.status === 'failed') {
          const stepId = this.getCurrentStepTempId();
          const testId = this.getCurrentTestTempId();
          if (testId) {
            for (const entry of buildErrorLogs(hook.err)) {
              this.logMessage(testId, entry.message, entry.level, stepId, entry.logFormat);
            }
          }
        }
        this.finishStep(hook, this.getCurrentStepTempId());
      }
    });

    this.runner.on(Mocha.Runner.constants.EVENT_RUN_END, async () => {
      // If we expect spec-level artifacts (video), wait for the plugin's after:spec event.
      const shouldReportVideo = this.options.reportVideo !== false;
      if (shouldReportVideo) {
        await this.waitForSpecArtifacts(15000);
      }

      // Always wait for async work (file IO, IPC callbacks, etc.) to complete *before*
      // we attempt to flush/finish the run.
      await this.awaitInflight();

      // Parallel runners never finish the run; they only flush.
      if (this.isParallel) {
        await this.flushClient();
        return;
      }

      if (OrangebeardCypressReporter.currentRun !== OrangebeardCypressReporter.totalNumberOfRuns) {
        return;
      }

      // Wait again in case late plugin events (like after:spec artifacts) are still in-flight.
      await this.awaitInflight();

      await OrangebeardCypressReporter.client!.finishTestRun(OrangebeardCypressReporter.testRun!, {
        endTime: getTime(),
      } as any);

      if (OrangebeardCypressReporter.lockFileName) {
        deleteLockFile(OrangebeardCypressReporter.lockFileName);
      }
    });
  }

  private startTestRun(): void {
    const testset = OrangebeardCypressReporter.resolvedTestset;
    if (!testset) {
      OrangebeardCypressReporter.disabled = true;
      // eslint-disable-next-line no-console
      console.error('[Orangebeard] Cannot start test run: testset is missing.');
      return;
    }

    OrangebeardCypressReporter.testRun = OrangebeardCypressReporter.client!.startTestRun(
      getStartTestRun({
        testset,
        description:
          OrangebeardCypressReporter.client?.config?.description ?? this.options.description,
        attributes:
          OrangebeardCypressReporter.client?.config?.attributes ?? this.options.attributes,
      }),
    ) as UUID;

    OrangebeardCypressReporter.lockFileName = createLockFile(OrangebeardCypressReporter.testRun);
  }

  private joinExistingRun(testRunUUID: UUID): void {
    // Ensure async client can treat the provided UUID as an already-resolved parent.
    const clientAny = OrangebeardCypressReporter.client! as any;
    clientAny.promises[testRunUUID] = Promise.resolve(testRunUUID);
    clientAny.uuidMap[testRunUUID] = testRunUUID;

    // Announce/join (best-effort). Even if this fails, reporting can still proceed.
    OrangebeardCypressReporter.client!.startAnnouncedTestRun(testRunUUID);

    OrangebeardCypressReporter.testRun = testRunUUID;
  }

  private static numberOfRuns(): void {
    if (OrangebeardCypressReporter.totalNumberOfRuns > 0) return;
    OrangebeardCypressReporter.totalNumberOfRuns = getTotalSpecs(OrangebeardCypressReporter.cypressConfig);
  }

  private getCurrentSuiteTempId(): UUID | null {
    return OrangebeardCypressReporter.activeSuites.length
      ? OrangebeardCypressReporter.activeSuites[OrangebeardCypressReporter.activeSuites.length - 1].tempId
      : null;
  }

  private getCurrentTestTempId(): UUID | null {
    return OrangebeardCypressReporter.activeTests.length
      ? OrangebeardCypressReporter.activeTests[OrangebeardCypressReporter.activeTests.length - 1].tempId
      : null;
  }

  private getCurrentStepTempId(): UUID | null {
    return OrangebeardCypressReporter.activeSteps.length
      ? OrangebeardCypressReporter.activeSteps[OrangebeardCypressReporter.activeSteps.length - 1].tempId
      : null;
  }


  private logMessage(
    testId: UUID | null,
    message: any,
    logLevel: string,
    stepId: UUID | null = null,
    logFormat: 'PLAIN_TEXT' | 'MARKDOWN' = 'PLAIN_TEXT',
  ): UUID {
    if (OrangebeardCypressReporter.disabled) {
      return '' as unknown as UUID;
    }

    if (!testId) {
      // no active test context
      return '' as unknown as UUID;
    }

    const logItem = {
      testRunUUID: OrangebeardCypressReporter.testRun,
      testUUID: testId,
      stepUUID: stepId ?? undefined,
      logTime: getTime(),
      message,
      logLevel,
      logFormat,
    };

    return OrangebeardCypressReporter.client!.log(logItem as any) as UUID;
  }

  private logAttachment(
    testId: UUID | null,
    logId: UUID,
    attachment?: { name: string; contentType: string; content: Buffer },
    stepId: UUID | null = null,
  ): void {
    if (OrangebeardCypressReporter.disabled) return;
    if (!testId || !attachment) return;

    const payload: Attachment = {
      file: attachment,
      metaData: {
        testRunUUID: OrangebeardCypressReporter.testRun!,
        testUUID: testId,
        logUUID: logId,
        stepUUID: stepId ?? undefined,
        attachmentTime: getTime(),
      },
    };

    OrangebeardCypressReporter.client!.sendAttachment(payload);
  }

  private startTest(test: any, type: string): UUID | undefined {
    const parent = this.getCurrentSuiteTempId();
    if (!parent) return undefined;

    const newTest = OrangebeardCypressReporter.client!.startTest({
      testRunUUID: OrangebeardCypressReporter.testRun!,
      suiteUUID: parent,
      testName: test.title,
      testType: type,
      startTime: getTime(),
    } as any);

    // Log body (when available) as Markdown code block.
    if (typeof test.body === 'string' && test.body.trim()) {
      this.logMessage(newTest, formatAsMarkdownCodeBlock(test.body, 'js'), level.INFO, null, 'MARKDOWN');
    }

    const fullName = this.getTestFullName(test);

    OrangebeardCypressReporter.activeTests.push({
      parent,
      tempId: newTest,
      name: test.title,
      fullName,
      cyId: test.id || '',
    });

    // Keep a mapping so late screenshot events (after test end) can still be attributed correctly.
    // Keys are normalized to match Cypress screenshot filenames.
    indexTestName(OrangebeardCypressReporter.testNameToUUID, newTest, test.title);
    if (fullName) {
      indexTestName(OrangebeardCypressReporter.testNameToUUID, newTest, fullName);
    }

    return newTest;
  }

  private finishTest(test: any, skipped = false): void {
    let unclosedChild: ActiveItem | undefined;
    while (
      (unclosedChild = OrangebeardCypressReporter.activeSteps.find(
        (o) => o.parent === this.getCurrentTestTempId(),
      ))
    ) {
      this.finishStep({ status: 'STOPPED' }, unclosedChild.tempId);
    }

    // If Cypress did not emit "log:changed" for some commands (or the test ended abruptly),
    // make sure we don't leak steps.
    this.commandStepTracker.cleanupDanglingSteps();

    OrangebeardCypressReporter.client!.finishTest(this.getCurrentTestTempId()!, {
      testRunUUID: OrangebeardCypressReporter.testRun!,
      status: skipped ? status.SKIPPED : test.state === 'failed' ? status.FAILED : status.PASSED,
      endTime: getTime(),
    } as any);

    OrangebeardCypressReporter.activeTests.pop();
  }

  private startStep(step: any): UUID | undefined {
    const parentTest = this.getCurrentTestTempId();
    if (!parentTest) return undefined;

    const newStep = OrangebeardCypressReporter.client!.startStep({
      testRunUUID: OrangebeardCypressReporter.testRun!,
      testUUID: parentTest,
      stepName: step.title,
      startTime: getTime(),
    } as any);

    if (typeof step.body === 'string' && step.body.trim()) {
      this.logMessage(parentTest, formatAsMarkdownCodeBlock(step.body, 'js'), level.INFO, newStep, 'MARKDOWN');
    }

    OrangebeardCypressReporter.activeSteps.push({
      parent: parentTest,
      tempId: newStep,
      name: step.title,
      cyId: step.id || '',
    });

    return newStep;
  }

  private finishStep(step: any, stepTempId: UUID | null): void {
    if (!stepTempId) return;

    OrangebeardCypressReporter.client!.finishStep(stepTempId, {
      testRunUUID: OrangebeardCypressReporter.testRun!,
      status: step.status === 'failed' ? status.FAILED : status.PASSED,
      endTime: getTime(),
    } as any);

    this.removeStepsWithId(stepTempId);
  }

  private removeStepsWithId(id: UUID): void {
    for (let i = OrangebeardCypressReporter.activeSteps.length - 1; i >= 0; i -= 1) {
      if (OrangebeardCypressReporter.activeSteps[i].tempId === id) {
        OrangebeardCypressReporter.activeSteps.splice(i, 1);
      }
    }
  }

  private async reportScreenshot(details: any): Promise<void> {
    const screenshotPath = details?.screenshotInfo?.path as string | undefined;
    if (!screenshotPath) return;

    const resolvedTestId = resolveTestIdForScreenshotPath(OrangebeardCypressReporter.testNameToUUID, screenshotPath);
    const testId = resolvedTestId ?? this.getCurrentTestTempId();
    if (!testId) return;

    const content = await getBytes(screenshotPath);
    const attachment = {
      name: path.basename(screenshotPath),
      contentType: 'image/png',
      content,
    };

    const message = details?.logMessage ?? `Screenshot: ${attachment.name}`;
    const logId = this.logMessage(testId, message, level.INFO, this.getCurrentStepTempId());
    this.logAttachment(testId, logId, attachment, this.getCurrentStepTempId());
  }

  private async reportSpecArtifacts(details: any): Promise<void> {
    const results = details?.results;
    const spec = details?.spec;

    const videoPath = results?.video as string | undefined;

    // Always attach video to the spec's *root* suite.
    const rootSuiteId = resolveRootSuiteIdForSpec(OrangebeardCypressReporter.specSuites, spec);

    // Report video unless explicitly disabled.
    const shouldReportVideo = this.options.reportVideo !== false;

    if (shouldReportVideo && videoPath && rootSuiteId) {
      const videoAttachment = {
        name: path.basename(videoPath),
        contentType: 'video/mp4',
        content: await getBytes(videoPath),
      };

      const videoItemId = OrangebeardCypressReporter.client!.startTest({
        testRunUUID: OrangebeardCypressReporter.testRun!,
        suiteUUID: rootSuiteId,
        testName: 'Video recording',
        testType: testEntity.AFTER,
        startTime: getTime(),
      } as any);

      const logId = this.logMessage(videoItemId, 'Video recording', level.INFO);
      this.logAttachment(videoItemId, logId, videoAttachment);

      OrangebeardCypressReporter.client!.finishTest(videoItemId, {
        testRunUUID: OrangebeardCypressReporter.testRun!,
        status: status.PASSED,
        endTime: getTime(),
      } as any);
    }

    // Do not attach screenshots here.
    // Cypress already emits `after:screenshot` for each screenshot and we attach them there.
  }

  private track<T>(promise: Promise<T>): void {
    if (OrangebeardCypressReporter.disabled) return;

    OrangebeardCypressReporter.inflight.add(promise);
    promise.finally(() => {
      OrangebeardCypressReporter.inflight.delete(promise);
    });
  }

  private async awaitInflight(): Promise<void> {
    if (OrangebeardCypressReporter.disabled) return;

    // Drain until stable: async handlers may schedule more async work.
    while (OrangebeardCypressReporter.inflight.size > 0) {
      // Snapshot the current inflight promises.
      const pending = Array.from(OrangebeardCypressReporter.inflight);
      await Promise.allSettled(pending);
    }
  }

  private async flushClient(): Promise<void> {
    if (OrangebeardCypressReporter.disabled) return;

    // Ensure no additional Orangebeard client calls will be enqueued.
    await this.awaitInflight();

    const clientAny = OrangebeardCypressReporter.client! as any;
    await Promise.all(Object.values(clientAny.promises ?? {}));
  }

  private resolveTestset(): string | null {
    // Precedence required:
    // 1) client autoconfig
    // 2) reporterOptions.testset
    // 3) env ORANGEBEARD_TESTSET
    const fromClient = OrangebeardCypressReporter.client?.config?.testset;
    if (typeof fromClient === 'string' && fromClient.trim().length > 0) return fromClient.trim();

    const fromOptions = this.options?.testset;
    if (typeof fromOptions === 'string' && fromOptions.trim().length > 0) return fromOptions.trim();

    const fromEnv = process.env.ORANGEBEARD_TESTSET;
    if (typeof fromEnv === 'string' && fromEnv.trim().length > 0) return fromEnv.trim();

    return null;
  }


  private getTestFullName(test: any): string | null {
    // Prefer Cypress-specific titlePath() if present (matches screenshot naming convention)
    // Example screenshot: "Suite -- Subsuite -- Test title (failed)"
    if (typeof test?.titlePath === 'function') {
      const tp = test.titlePath();
      if (Array.isArray(tp) && tp.length > 0) {
        const joined = tp.filter(Boolean).join(' -- ');
        return joined.trim() ? joined : null;
      }
    }

    if (typeof test?.fullTitle === 'function') {
      const ft = test.fullTitle();
      return typeof ft === 'string' && ft.trim() ? ft.trim() : null;
    }

    return null;
  }


  private ensureSpecArtifactsPromise(specKey: string): Promise<void> {
    const key = normalizeSpecKey(specKey);
    if (!key) return Promise.resolve();

    const existing = OrangebeardCypressReporter.specArtifactsPromises.get(key);
    if (existing) return existing;

    let resolveFn: (() => void) | null = null;
    const p = new Promise<void>((resolve) => {
      resolveFn = resolve;
    });

    OrangebeardCypressReporter.specArtifactsPromises.set(key, p);
    OrangebeardCypressReporter.specArtifactsResolvers.set(key, resolveFn!);
    return p;
  }

  private signalSpecArtifacts(spec: any): void {
    const candidates: Array<string | undefined> = [
      spec?.relative,
      spec?.name,
      spec?.fileName,
      spec?.absolute,
      OrangebeardCypressReporter.activeSpec ?? undefined,
      this.currentSpecKey ?? undefined,
    ];

    for (const c of candidates) {
      const key = normalizeSpecKey(c);
      if (!key) continue;

      const resolveFn = OrangebeardCypressReporter.specArtifactsResolvers.get(key);
      if (resolveFn) {
        resolveFn();
        OrangebeardCypressReporter.specArtifactsResolvers.delete(key);
      }

      const base = normalizeSpecKey(path.basename(key));
      if (base) {
        const resolveBase = OrangebeardCypressReporter.specArtifactsResolvers.get(base);
        if (resolveBase) {
          resolveBase();
          OrangebeardCypressReporter.specArtifactsResolvers.delete(base);
        }
      }
    }
  }

  private async waitForSpecArtifacts(timeoutMs: number): Promise<void> {
    const key = this.currentSpecKey;
    if (!key) return;

    const p = this.ensureSpecArtifactsPromise(key);

    let timeout: NodeJS.Timeout | null = null;
    try {
      await Promise.race([
        p,
        new Promise<void>((resolve) => {
          timeout = setTimeout(resolve, timeoutMs);
        }),
      ]);
    } finally {
      if (timeout) clearTimeout(timeout);
    }
  }


  private getRunnerId(): string | undefined {
    return (
      this.options.runnerId ||
      process.env.OB_RUNNER_ID ||
      process.env.CI_NODE_INDEX ||
      process.env.CIRCLE_NODE_INDEX ||
      process.env.BUILDKITE_PARALLEL_JOB ||
      String(process.pid)
    );
  }

  // Shared process-wide state (Cypress can create reporter instances per spec)
  private static disabled = false;
  private static resolvedTestset: string | null = null;
  private static inflight: Set<Promise<unknown>> = new Set();
  private static currentRun = 0;
  private static totalNumberOfRuns = 0;

  private static testRun: UUID | null = null;
  private static client: OrangebeardAsyncV3Client | null = null;
  private static configuration: CypressReporterConfiguration | null = null;
  private static cypressConfig: any;

  private static activeSuites: ActiveItem[] = [];
  private static activeTests: ActiveItem[] = [];
  private static activeSteps: ActiveItem[] = [];

  private static lockFileName: string | null = null;
  private static activeSpec: string | null = null;
  private static previousSuite: ActiveItem | null = null;
  private static specSuites: SpecSuiteIndex = {};
  private static specArtifactsPromises: Map<string, Promise<void>> = new Map();
  private static specArtifactsResolvers: Map<string, () => void> = new Map();
  private static testNameToUUID: TestNameIndex = new Map();
}
