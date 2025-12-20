import test from 'node:test';
import assert from 'node:assert/strict';
import * as path from 'node:path';

import OrangebeardCypressReporter from '../reporter/OrangebeardCypressReporter';

function resetReporterStatics() {
  const R: any = OrangebeardCypressReporter;
  R.specSuites = {};
  R.testNameToUUID = new Map();
  R.activeSpec = null;
  R.client = { config: {} };
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

test('formatAsMarkdownCodeBlock wraps and escapes fences', () => {
  resetReporterStatics();
  const reporter: any = makeReporterWithOptions();

  const md = reporter.formatAsMarkdownCodeBlock('line1\n```\nline2', 'js');
  assert.ok(md.startsWith('```js\n'));
  assert.ok(md.endsWith('\n```'));
  assert.ok(md.includes('\\`\\`\\`'));
});

test('parseErrorLog returns MARKDOWN with codeFrame wrapped in code block', () => {
  resetReporterStatics();
  const reporter: any = makeReporterWithOptions();

  const parsed = reporter.parseErrorLog({
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
  const reporter: any = makeReporterWithOptions();

  const suiteId = '8da18397-ace1-4002-be78-b0bbd2a04af5';

  reporter.indexSpecSuite(suiteId, 'cypress\\e2e\\app.cy.js');

  // direct match
  assert.equal(
    reporter.resolveRootSuiteIdForSpec({ relative: 'cypress\\e2e\\app.cy.js' }),
    suiteId,
  );

  // basename match
  assert.equal(reporter.resolveRootSuiteIdForSpec({ name: 'app.cy.js' }), suiteId);

  // absolute path match should work through basename fallback
  assert.equal(
    reporter.resolveRootSuiteIdForSpec({ absolute: 'E:/x/y/cypress/e2e/app.cy.js' }),
    suiteId,
  );
});

test('resolveTestIdForScreenshotPath uses screenshot filename to select correct test UUID', () => {
  resetReporterStatics();
  const R: any = OrangebeardCypressReporter;
  const reporter: any = makeReporterWithOptions();

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

  assert.equal(reporter.resolveTestIdForScreenshotPath(p1), uuidEmpty);
  assert.equal(reporter.resolveTestIdForScreenshotPath(p2), uuidTodos);
});
