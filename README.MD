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
  <a href="https://github.com/orangebeard-io/cypress-listener/actions">
    <img src="https://img.shields.io/github/workflow/status/orangebeard-io/cypress-listener/release?style=flat-square"
      alt="Build Status" />
  </a>
  <a href="https://github.com/orangebeard-io/cypress-listener/blob/master/LICENSE">
    <img src="https://img.shields.io/github/license/orangebeard-io/cypress-listener?style=flat-square"
      alt="License" />
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

### Install the npm package

```shell
npm install @orangebeard-io/cypress-listener
```

## Configuration

### 1) Create `orangebeard.json`
Create an `orangebeard.json` file in your Cypress project directory (or any parent directory). This is the same mechanism as the Playwright listener.

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

### 2) Optional: override/extend via environment variables
You can set env vars **without** `orangebeard.json`, or **on top of** it:

```shell
ORANGEBEARD_ENDPOINT=https://company.orangebeard.app
ORANGEBEARD_TOKEN=XXXXXXXX-XXXX-XXXX-XXXX-XXXXXXXXXXXX
ORANGEBEARD_PROJECT=my_project
ORANGEBEARD_TESTSET="My Cypress run"
ORANGEBEARD_DESCRIPTION="My awesome testrun"
ORANGEBEARD_ATTRIBUTES="key:value; value;"
ORANGEBEARD_REFERENCE_URL="https://ci.example/job/123"
```

### 3) Configure Cypress
In your `cypress.config.js` (or `.ts`) file, configure the reporter and register the plugin:

```js
const { defineConfig } = require('cypress');
const registerOrangebeardPlugin = require('@orangebeard-io/cypress-listener/plugin');
const glob = require('glob');

const delay = async (ms) => new Promise((res) => setTimeout(res, ms));

module.exports = defineConfig({
  reporter: '@orangebeard-io/cypress-listener',
  reporterOptions: {
    // Listener-specific options (Orangebeard connection settings are read from orangebeard.json + env)
    reportVideo: false, // optional; requires Cypress video: true

    // Parallel mode (Cypress Cloud): join a shared run and do NOT finish it
    // parallelMode: true,
    // testRunUUID: process.env.ORANGEBEARD_TEST_RUN_UUID,
    // runnerId: process.env.CI_NODE_INDEX,

    // Backwards compatible (not recommended): override orangebeard.json/env
    // endpoint: 'https://tenant.orangebeard.app',
    // token: '...',
    // project: '...',
    // testset: '...',
    // description: '...',
  },
  e2e: {
    setupNodeEvents(on, config) {
      // keep Cypress running until the listener has finished sending its async events
      on('after:run', async () => {
        while (glob.sync('orangebeard-*.lock').length > 0) {
          await delay(500);
        }
      });

      registerOrangebeardPlugin(on, config);
      return config;
    },
  },

  video: true,
});
```

To forward `cy.log(...)` output as Orangebeard logs, call the commands helper from your Cypress support file:

```js
const { registerOrangebeardCommands } = require('@orangebeard-io/cypress-listener/commands');

registerOrangebeardCommands();
```


### Running

Now run your tests normally using `cypress run` and get results in Orangebeard!

Note that when running a subset from the commandline, you will have to use the `--config` flag, as the `--spec` flag will not be passed to the reporter, resulting in the reporter to expect all specs in the project and thus not finishing up correctly.

Example:
```
cypress run --browser chrome --config "specPattern=cypress/e2e/somespec/*.cy.js"
```
or:
```
cypress run --browser chrome --config '{"specPattern":["cypress/e2e/somespec/*.cy.js"]}'
```

Using the `--reporter-options` or `-o` flag, it is also possible to provide reporter options from the command line.

### Parallel execution (Cypress Cloud)
When running Cypress in parallel across multiple CI machines, each machine runs its own `cypress run` process, so this reporter cannot reliably know which runner is "last".

Workflow:
1. Start a shared Orangebeard run once (in a coordinator job) and capture the UUID:
   ```
   npx ob-cypress start-run --testset "My Cypress run"
   ```
   If you are not using `orangebeard.json`/env vars for connection settings, also pass:
   ```
   npx ob-cypress start-run --endpoint <url> --token <token> --project <project> --testset "My Cypress run"
   ```
2. Pass the UUID to all parallel Cypress jobs (e.g. as `ORANGEBEARD_TEST_RUN_UUID`), and set:
   - `reporterOptions.parallelMode = true`
   - `reporterOptions.testRunUUID = process.env.ORANGEBEARD_TEST_RUN_UUID`
3. After all parallel jobs complete, finish the run once:
   ```
   npx ob-cypress finish-run --testRunUUID <uuid>
   ```
   (Optionally also pass `--endpoint/--token/--project` if not coming from config/env.)
