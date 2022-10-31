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

In your cypress.config.js file, provide the necessary configuration for the listener and the plugin to combine multiple spec files into a single run:

```JavaScript
const { defineConfig } = require('cypress');
const registerOrangebeardPlugin = require('@orangebeard-io/cypress-listener/lib/plugin');

module.exports = defineConfig({
  "reporter": "@orangebeard-io/cypress-listener",
  "reporterOptions": {
    "endpoint": "http://tenant.orangebeard.app",
    "token": "00000000-0000-0000-0000-00000000",
    "testset": "Cypress.io test run",
    "project": "project_name",
    "description": "A description of the test run"
  },
  e2e: {
    setupNodeEvents(on, config) {
      return registerOrangebeardPlugin(on, config);
    },
  },
});
```


### Running

Now run your tests normally `cypress run` and get results in Orangebeard!
