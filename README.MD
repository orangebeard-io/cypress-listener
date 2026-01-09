<h1 align="center">
  <a href="https://github.com/orangebeard-io/cypress-listener">
    <img src="https://raw.githubusercontent.com/orangebeard-io/cypress-listener/master/.github/logo.svg" alt="Orangebeard.io Cypress.io Listener" height="200">
  </a>
  <br>Orangebeard.io Cypress Listener<br>
</h1>

<h4 align="center">Orangebeard listener (a service and reporter) for <a href="https://cypress.io/" target="_blank" rel="noopener">Cypress.io</a></h4>

<p align="center">
  <a href="https://www.npmjs.com/package/@orangebeard-io/cypress-listener">
    <img src="https://img.shields.io/npm/v/@orangebeard-io/cypress-listener.svg?style=flat-square"
      alt="NPM Version" />
  </a>
  <a href="https://github.com/orangebeard-io/vitest-reporter/actions">
    <img src="https://img.shields.io/github/actions/workflow/status/orangebeard-io/cypress-listener/release.yml?branch=master&style=flat-square"
      alt="Build Status" />
  </a>
</p>

<div align="center">
  <h4>
    <a href="https://orangebeard.io">Orangebeard</a> |
    <a href="#installation">Installation</a> |
    <a href="#configuration">Configuration</a>
  </h4>
</div>

## Installation
Install the package in your Cypress project:

```shell
npm install --save-dev @orangebeard-io/cypress-listener
```

## Quick start (step-by-step)
1. Install `@orangebeard-io/cypress-listener`.
2. Provide Orangebeard connection settings (recommended: `orangebeard.json`).
3. Configure Cypress to use the Orangebeard reporter + plugin.
4. (Optional) Enable browser-side command + `cy.log(...)` forwarding via `registerOrangebeardCommands()`.
5. Run `cypress run`.

## Configuration
This package consists of:
- A **Mocha reporter** (configured via `reporter` / `reporterOptions`)
- A **Cypress plugin** (registered via `setupNodeEvents`)
- Optional **browser-side helpers** (registered in `cypress/support/*`)

### 1) Orangebeard connection settings
The reporter uses `@orangebeard-io/javascript-client` autoconfiguration. Settings are resolved from:
- `orangebeard.json` in your project directory (or any parent directory)
- Environment variables (can override/extend `orangebeard.json`)

#### `orangebeard.json` (recommended)
Create `orangebeard.json` in your Cypress project directory (or any parent directory):

```json
{
  "endpoint": "https://<tenant>.orangebeard.app",
  "token": "00000000-0000-0000-0000-000000000000",
  "project": "my_project",
  "testset": "My Cypress run",
  "description": "A run from Cypress",
  "attributes": [
    { "key": "branch", "value": "main" },
    { "value": "smoke" }
  ],
  "referenceUrl": "https://ci.example/job/123"
}
```

Required fields:
- `endpoint`
- `token`
- `project`
- `testset` (required; if missing/empty, the listener will log an error and disable reporting)

Optional fields:
- `description`
- `attributes`
- `referenceUrl`

#### Environment variables (optional)
You can configure via env vars **without** `orangebeard.json`, or override values **on top of** it:

```shell
ORANGEBEARD_ENDPOINT=https://company.orangebeard.app
ORANGEBEARD_TOKEN=XXXXXXXX-XXXX-XXXX-XXXX-XXXXXXXXXXXX
ORANGEBEARD_PROJECT=my_project
ORANGEBEARD_TESTSET="My Cypress run"

# Optional
ORANGEBEARD_DESCRIPTION="My awesome testrun"
ORANGEBEARD_ATTRIBUTES="key:value; value;"
ORANGEBEARD_REFERENCE_URL="https://ci.example/job/123"
```

### 2) Configure Cypress (reporter + plugin)
In `cypress.config.js` (or `.ts`), configure the reporter and register the plugin:

```js
const { defineConfig } = require('cypress');
const registerOrangebeardPlugin = require('@orangebeard-io/cypress-listener/plugin');

module.exports = defineConfig({
  reporter: '@orangebeard-io/cypress-listener',
  reporterOptions: {
    // optional; default is true (if Cypress produces a video file)
    reportVideo: true,

    // Parallel mode (Cypress Cloud): join a shared run and do NOT finish it
    // parallelMode: true,
    // testRunUUID: process.env.ORANGEBEARD_TEST_RUN_UUID,
    // runnerId: process.env.CI_NODE_INDEX,
  },
  e2e: {
    setupNodeEvents(on, config) {
      // Required: registers tasks + screenshot/video forwarding + (by default) waits for lockfiles in after:run
      registerOrangebeardPlugin(on, config);
      return config;
    },
  },

  // Enable Cypress video recording if you want videos attached in Orangebeard
  video: true,
});
```

### 3) (Optional) Configure browser-side helpers (command steps + cy.log forwarding)
To forward `cy.log(...)` output as Orangebeard logs and capture Cypress commands as Orangebeard **steps**,
call the commands helper from your Cypress support file:

```js
const { registerOrangebeardCommands } = require('@orangebeard-io/cypress-listener/commands');

registerOrangebeardCommands();

// Disable Cypress command step capture if you only want cy.log forwarding:
// registerOrangebeardCommands({ captureCypressCommandSteps: false });
```

## Options
### Reporter options (`reporterOptions`)
These are passed under `reporterOptions` in `cypress.config.*`.

- `reportVideo` (boolean, default: `true`)
  - If `true` and Cypress has `video: true`, the reporter will attach the per-spec video (`*.mp4`) to the suite for that spec file.
  - If `false`, videos are not attached.

- `cleanupOldLockfiles` (boolean, default: `true`)
  - If `true`, the reporter will delete any existing `orangebeard-*.lock` files **before** creating its own lockfile.
  - This prevents Cypress from waiting on stale lockfiles left behind by previous runs that were killed/crashed.
  - Set to `false` to keep the previous behavior (leave existing lockfiles in place and only warn).

- `parallelMode` (boolean, default: `false`)
  - When `true`, the reporter will **not** finish the test run (because each parallel worker can’t know when the overall run is done).

- `testRunUUID` (string)
  - Required when `parallelMode: true`.

- `runnerId` (string)
  - Optional identifier used to disambiguate top-level suites in parallel runs.

Note: Orangebeard connection settings (endpoint/token/project/testset/...) are expected to come from `orangebeard.json` and/or env vars.
Providing them in `reporterOptions` is supported for backwards compatibility, but not recommended.

### Plugin options (3rd argument to `registerOrangebeardPlugin`)
The plugin is registered like:

```js
registerOrangebeardPlugin(on, config, {
  // options...
});
```

- `waitForLockfiles` (boolean, default: `true`)
  - If `true`, the plugin waits in `after:run` until `orangebeard-*.lock` files are gone.
  - If `false`, Cypress may exit before the reporter finishes async IO/flush.

- `lockfilePollIntervalMs` (number, default: `500`)
  - Poll interval for lockfile checks.

- `lockfileTimeoutMs` (number, default: `300000` (5 minutes))
  - Maximum time to wait before continuing Cypress shutdown.

- `screenshotLogFn` (function)
  - Customize the log message used when attaching screenshots.

### Commands helper options (`registerOrangebeardCommands`)
- `captureCypressCommandSteps` (boolean, default: `true`)
  - If `true`, Cypress commands are reported as steps in Orangebeard.

## Running
Run Cypress as usual:

```shell
cypress run
```

### Running a subset of specs
Cypress does not always pass `--spec` through to the reporter, so if you run a subset you should prefer `--config specPattern=...`.

Example:

```shell
cypress run --browser chrome --config "specPattern=cypress/e2e/somespec/*.cy.js"
```

## Parallel execution (Cypress Cloud)
When running Cypress in parallel across multiple CI machines, each machine runs its own `cypress run` process, so the reporter cannot reliably know which runner is "last".

Workflow:
1. Start a shared Orangebeard run once (in a coordinator job) and capture the UUID:

   ```
   npx orangebeard-cy start-run --testset "My Cypress run"
   ```

2. Pass the UUID to all parallel Cypress jobs (e.g. as `ORANGEBEARD_TEST_RUN_UUID`) and set:
   - `reporterOptions.parallelMode = true`
   - `reporterOptions.testRunUUID = process.env.ORANGEBEARD_TEST_RUN_UUID`

3. After all parallel jobs complete, finish the run once:

   ```
   npx orangebeard-cy finish-run --testRunUUID <uuid>
   ```

## What gets reported
- Suites and tests from Mocha
- Hook failures (before/after)
- Cypress test tags (see below)
- `cy.log(...)` output (if `registerOrangebeardCommands()` is enabled)
- Cypress command steps (if `captureCypressCommandSteps: true`)
- Screenshots (via `after:screenshot`) attached to the correct failing test
- Per-spec video files (via `after:spec`) attached to the suite for that spec file (when `video: true` and `reportVideo: true`)

## Cypress tags → Orangebeard attributes
If you add Cypress tags to a test, they will be sent as Orangebeard **attributes** on the test item.

Example:

```js
it('adds 2 todos', {
  tags: [
    '@some-tag',
    '@requirement:REQ-123',
    '@issueURL:https://gitlab.com/project/issues/1234',
  ],
}, () => {
  // ...
});
```

Mapping:
- `@some-tag` → `{ value: 'some-tag' }`
- `@requirement:REQ-123` → `{ key: 'requirement', value: 'REQ-123' }`
- `@issueURL:https://gitlab.com/project/issues/1234` → `{ key: 'issueURL', value: 'https://gitlab.com/project/issues/1234' }` -> Will translate to a clickable tag named issueURL.
