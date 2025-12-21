import test from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { getStartTestRun, getTotalSpecs } from '../utils';

test('getStartTestRun uses provided testset string', () => {
  const run = getStartTestRun({
    testset: 'My Test Set',
    description: 'desc',
    attributes: [{ value: 'tag' }],
  });

  assert.equal(run.testSetName, 'My Test Set');
  assert.equal(run.description, 'desc');
  assert.deepEqual(run.attributes, [{ value: 'tag' }]);
  assert.equal(typeof run.startTime, 'string');
  assert.ok(run.startTime.length > 0);
});

test('getTotalSpecs counts matching specPattern files', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ob-cypress-listener-'));
  const e2eDir = path.join(root, 'cypress', 'e2e');
  fs.mkdirSync(e2eDir, { recursive: true });

  fs.writeFileSync(path.join(e2eDir, 'a.cy.js'), '');
  fs.writeFileSync(path.join(e2eDir, 'b.cy.js'), '');

  const specPattern = path.join(e2eDir, '**', '*.cy.js').replace(/\\/g, '/');

  const count = getTotalSpecs({
    specPattern,
    excludeSpecPattern: [],
    supportFile: path.join(root, 'cypress', 'support', 'e2e.js').replace(/\\/g, '/'),
    fixturesFolder: false,
  });

  assert.equal(count, 2);
});
