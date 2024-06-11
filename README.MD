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

In your cypress.config.js file, provide the necessary configuration for the listener and the plugin:

```JavaScript
const { defineConfig } = require('cypress');
const registerOrangebeardPlugin = require('@orangebeard-io/cypress-listener/lib/plugin');
const glob = require('glob');
const delay = async (ms) => new Promise((res) => setTimeout(res, ms));

module.exports = defineConfig({
  "reporter": "@orangebeard-io/cypress-listener",
  "reporterOptions": {
    "endpoint": "https://tenant.orangebeard.app",
    "token": "00000000-0000-0000-0000-00000000",
    "testset": "Cypress.io test run",
    "project": "project_name",
    "description": "A description of the test run", 
    "reportVideo": false //optional
  },
    e2e: {
        setupNodeEvents(on, config) {
            // keep Cypress running until the listener has finished sending its async events, preventing unfinished runs in Orangebeard
            on('after:run', async () => {
                console.log('Wait for Orangebeard listener to finish reporting...');
                while (glob.sync('orangebeard-*.lock').length > 0) {
                    await delay(500);
                }
                console.log('Orangebeard listener finished');
            });
            registerOrangebeardPlugin(on, config);
            return config;
        },
    },
    video: true, //optional
});
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
