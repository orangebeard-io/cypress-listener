import test from 'node:test';
import assert from 'node:assert/strict';
import * as path from 'node:path';

import OrangebeardCypressReporter from '../reporter/OrangebeardCypressReporter';
import {
  formatAsMarkdownCodeBlock,
  normalizeIncomingLog,
  parseErrorLog,
} from '../reporter/logging';
import { CommandStepTracker } from '../reporter/commandStepTracker';
import { indexSpecSuite, resolveRootSuiteIdForSpec } from '../reporter/specSuiteIndex';
import { resolveTestIdForScreenshotPath } from '../reporter/testNameIndex';
import {
  extractCypressTags,
  getSuiteAttributesFromTags,
  getTestAttributesFromTags,
} from '../reporter/tags';

function resetReporterStatics() {
  const R: any = OrangebeardCypressReporter;
  R.specSuites = {};
  R.testNameToUUID = new Map();
  R.activeSpec = null;
  R.client = { config: {} };
  R.disabled = false;
  R.testRun = null;
  R.testRunFinished = false;
  R.lockFileName = null;
  R.currentRun = 0;
  R.totalNumberOfRuns = 0;
}

function makeReporterWithOptions(options: Record<string, any> = {}) {
  const r: any = Object.create((OrangebeardCypressReporter as any).prototype);
  r.options = options;
  return r;
}

test('resolveTestset precedence: client > reporterOptions > env', () => {
  resetReporterStatics();
  const R: any = OrangebeardCypressReporter;

  process.env.ORANGEBEARD_TESTSET = 'fromEnv';
  R.client = { config: { testset: 'fromClient' } };

  const reporter: any = makeReporterWithOptions({ testset: 'fromOptions' });
  assert.equal(reporter.resolveTestset(), 'fromClient');

  R.client = { config: { testset: '   ' } };
  assert.equal(reporter.resolveTestset(), 'fromOptions');

  reporter.options = { testset: '' };
  assert.equal(reporter.resolveTestset(), 'fromEnv');

  reporter.options = { testset: '   ' };
  process.env.ORANGEBEARD_TESTSET = '   ';
  assert.equal(reporter.resolveTestset(), null);

  delete process.env.ORANGEBEARD_TESTSET;
});

test('isExplicitlyDisabled respects reporterOptions.disabled and ORANGEBEARD_DISABLED env var', () => {
  delete process.env.ORANGEBEARD_DISABLED;
  const reporter: any = makeReporterWithOptions({});
  assert.equal(reporter.isExplicitlyDisabled(), false);

  reporter.options = { disabled: true };
  assert.equal(reporter.isExplicitlyDisabled(), true);

  reporter.options = { disabled: false };
  assert.equal(reporter.isExplicitlyDisabled(), false);

  process.env.ORANGEBEARD_DISABLED = 'true';
  assert.equal(reporter.isExplicitlyDisabled(), true);

  process.env.ORANGEBEARD_DISABLED = '0';
  assert.equal(reporter.isExplicitlyDisabled(), false);

  delete process.env.ORANGEBEARD_DISABLED;
});

test('finalizeRun(force=true) finishes the run even when the spec-count heuristic never matches (--spec subset)', async () => {
  resetReporterStatics();
  const R: any = OrangebeardCypressReporter;
  const finishCalls: any[] = [];

  R.testRun = 'run-uuid';
  // Simulates `cypress run --spec <subset>`: only 1 spec actually ran in this process,
  // but the full project's specPattern still matches 50 files.
  R.currentRun = 1;
  R.totalNumberOfRuns = 50;
  R.client = {
    finishTestRun: async (uuid: string, payload: any) => {
      finishCalls.push([uuid, payload]);
    },
  };

  const reporter: any = makeReporterWithOptions({});
  reporter.isParallel = false;

  // The old spec-count heuristic alone would never consider this the last spec.
  await reporter.finalizeRun();
  assert.equal(finishCalls.length, 0);

  // The plugin's after:run signal is authoritative and must finish the run regardless.
  await reporter.finalizeRun(true);
  assert.equal(finishCalls.length, 1);
  assert.equal(finishCalls[0][0], 'run-uuid');
});

test('finalizeRun only finishes the run once, even if called again after the fact', async () => {
  resetReporterStatics();
  const R: any = OrangebeardCypressReporter;
  const finishCalls: any[] = [];

  R.testRun = 'run-uuid';
  R.currentRun = 1;
  R.totalNumberOfRuns = 1;
  R.client = {
    finishTestRun: async () => {
      finishCalls.push(1);
    },
  };

  const reporter: any = makeReporterWithOptions({});
  reporter.isParallel = false;

  // Normal (non-subset) run: the spec-count heuristic finishes it on the last spec.
  await reporter.finalizeRun();
  assert.equal(finishCalls.length, 1);

  // The plugin's after:run RUN_END signal arrives afterwards; must be a no-op.
  await reporter.finalizeRun(true);
  assert.equal(finishCalls.length, 1);
});

test('finalizeRun never finishes the run in parallel mode, even when forced', async () => {
  resetReporterStatics();
  const R: any = OrangebeardCypressReporter;
  const finishCalls: any[] = [];
  const flushCalls: any[] = [];

  R.testRun = 'run-uuid';
  R.client = {
    finishTestRun: async () => {
      finishCalls.push(1);
    },
  };

  const reporter: any = makeReporterWithOptions({ parallelMode: true });
  reporter.isParallel = true;
  reporter.flushClient = async () => {
    flushCalls.push(1);
  };

  await reporter.finalizeRun(true);

  assert.equal(finishCalls.length, 0);
  assert.equal(flushCalls.length, 1);
});

test('finalizeRun does nothing when the reporter is disabled', async () => {
  resetReporterStatics();
  const R: any = OrangebeardCypressReporter;
  const finishCalls: any[] = [];

  R.disabled = true;
  R.testRun = 'run-uuid';
  R.currentRun = 1;
  R.totalNumberOfRuns = 1;
  R.client = {
    finishTestRun: async () => {
      finishCalls.push(1);
    },
  };

  const reporter: any = makeReporterWithOptions({});
  reporter.isParallel = false;

  await reporter.finalizeRun(true);
  assert.equal(finishCalls.length, 0);
});

test('formatAsMarkdownCodeBlock wraps and escapes fences', () => {
  const md = formatAsMarkdownCodeBlock('line1\n```\nline2', 'js');
  assert.ok(md.startsWith('```js\n'));
  assert.ok(md.endsWith('\n```'));
  assert.ok(md.includes('\\`\\`\\`'));
});

test('parseErrorLog returns MARKDOWN with codeFrame wrapped in code block', () => {
  const parsed = parseErrorLog({
    name: 'AssertionError',
    type: 'assertion',
    message: 'boom',
    codeFrame: {
      relativeFile: 'cypress/e2e/app.cy.js',
      line: 10,
      column: 5,
      frame: 'cy.get("#x")\n  .should("exist")',
    },
  });

  assert.equal(parsed.logFormat, 'MARKDOWN');
  assert.ok(parsed.message.includes('```js'));
  assert.ok(parsed.message.includes('```'));
  assert.ok(parsed.message.includes('Reference (ln 10, col 5)'));
});

test('indexSpecSuite + resolveRootSuiteIdForSpec resolve to spec root suite', () => {
  resetReporterStatics();
  const R: any = OrangebeardCypressReporter;

  const suiteId = '8da18397-ace1-4002-be78-b0bbd2a04af5';

  indexSpecSuite(R.specSuites, suiteId, 'cypress\\e2e\\app.cy.js');

  // direct match
  assert.equal(resolveRootSuiteIdForSpec(R.specSuites, { relative: 'cypress\\e2e\\app.cy.js' }), suiteId);

  // basename match
  assert.equal(resolveRootSuiteIdForSpec(R.specSuites, { name: 'app.cy.js' }), suiteId);

  // absolute path match should work through derived relative key
  assert.equal(resolveRootSuiteIdForSpec(R.specSuites, { absolute: 'E:/x/y/cypress/e2e/app.cy.js' }), suiteId);
});

test('resolveTestIdForScreenshotPath uses screenshot filename to select correct test UUID', () => {
  resetReporterStatics();
  const R: any = OrangebeardCypressReporter;

  const uuidEmpty = '00000000-0000-0000-0000-000000000001';
  const uuidTodos = '00000000-0000-0000-0000-000000000002';

  // Simulate indexing both full name and last segment
  R.testNameToUUID.set('TodoMVC - React -- Contrast -- has good contrast when empty', uuidEmpty);
  R.testNameToUUID.set('has good contrast when empty', uuidEmpty);
  R.testNameToUUID.set('TodoMVC - React -- Contrast -- has good contrast with several todos', uuidTodos);
  R.testNameToUUID.set('has good contrast with several todos', uuidTodos);

  const p1 = path.join(
    'E:\\DEVELOPMENT\\ORANGEBEARD',
    'cypress\\screenshots\\app.cy.js',
    'TodoMVC - React -- Contrast -- has good contrast when empty (failed).png',
  );

  const p2 = path.join(
    'E:\\DEVELOPMENT\\ORANGEBEARD',
    'cypress\\screenshots\\app.cy.js',
    'TodoMVC - React -- Contrast -- has good contrast with several todos (failed).png',
  );

  assert.equal(resolveTestIdForScreenshotPath(R.testNameToUUID, p1), uuidEmpty);
  assert.equal(resolveTestIdForScreenshotPath(R.testNameToUUID, p2), uuidTodos);
});

test('normalizeIncomingLog maps levels and formats non-strings as markdown JSON', () => {
  const normalized = normalizeIncomingLog({ level: 'warn', message: { a: 1 } });
  assert.equal(normalized.level, 'WARN');
  assert.equal(normalized.logFormat, 'MARKDOWN');
  assert.ok(String(normalized.message).includes('```json'));
});

test('getTestAttributesFromTags maps tags to Orangebeard attributes', () => {
  const attrs = getTestAttributesFromTags({
    _testConfig: {
      tags: ['@high', '@requirement:REQ-201', '@testcase:TC-201-1'],
    },
  });

  assert.deepEqual(attrs, [
    { value: 'high' },
    { key: 'requirement', value: 'REQ-201' },
    { key: 'testcase', value: 'TC-201-1' },
  ]);
});

test('getSuiteAttributesFromTags maps tags to Orangebeard attributes', () => {
  const attrs = getSuiteAttributesFromTags({
    tags: ['@component:ui', '@smoke'],
  });

  assert.deepEqual(attrs, [{ key: 'component', value: 'ui' }, { value: 'smoke' }]);
});

test('extractCypressTags merges tags from multiple candidate locations', () => {
  const tags = extractCypressTags({
    tags: ['@a', '@b'],
    config: { tags: '@b, @c' },
    _testConfig: { tags: ['@c', '@d'] },
  });

  assert.deepEqual(tags, ['@a', '@b', '@c', '@d']);
});

test('CommandStepTracker starts and finishes a step', () => {
  const calls: any[] = [];

  const tracker = new CommandStepTracker({
    isDisabled: () => false,
    getTime: () => 't',
    getTestRunUUID: () => '00000000-0000-0000-0000-000000000010',
    getCurrentTestUUID: () => '00000000-0000-0000-0000-000000000020',
    resolveTestIdForNameKey: () => null,
    startStep: (payload: any) => {
      calls.push(['startStep', payload]);
      return '00000000-0000-0000-0000-000000000030';
    },
    finishStep: (id: any, payload: any) => {
      calls.push(['finishStep', id, payload]);
    },
    logMessage: (testId: any, message: any, logLevel: any, stepId: any, logFormat: any) => {
      calls.push(['logMessage', testId, message, logLevel, stepId, logFormat]);
      return '00000000-0000-0000-0000-000000000040';
    },
    formatAsMarkdownJson: (v: unknown) => String(v),
  });

  tracker.handleEvent({
    event: 'start',
    commandId: 'cmd1',
    commandName: 'get',
    message: 'foo',
  });

  tracker.handleEvent({
    event: 'finish',
    commandId: 'cmd1',
    state: 'passed',
  });

  assert.equal(calls[0][0], 'startStep');
  assert.equal(calls.find((c) => c[0] === 'finishStep')[0], 'finishStep');
});
