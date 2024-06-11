const fs = require('fs');
const path = require('path');
const glob = require('glob');
const minimatch = require('minimatch');
const ZonedDateTime = require('@js-joda/core').ZonedDateTime;

const { promisify } = require('util');
const stat = promisify(fs.stat);
const access = promisify(fs.access);

const fileExists = async (filepath) => {
  try {
    await access(filepath, fs.constants.F_OK);
    return true;
  } catch {
    return false;
  }
};

const waitForFile = async (filepath, interval = 1000, timeout = 60000) => {
  const start = Date.now();

  while (true) {
    const now = Date.now();
    if (now - start > timeout) {
      throw new Error(`Timeout: ${filepath} did not become available within ${timeout}ms`);
    }

    if (await fileExists(filepath)) {
      const initialStat = await stat(filepath);
      await new Promise((resolve) => setTimeout(resolve, interval));
      const finalStat = await stat(filepath);

      if (initialStat.mtimeMs === finalStat.mtimeMs && initialStat.size === finalStat.size) {
        return;
      }
    }

    await new Promise((resolve) => setTimeout(resolve, interval));
  }
};

const getByteArray = async (file) => {
  try {
    await waitForFile(file, 100, 5000)
    const data = fs.readFileSync(file);
    return new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
    //return new Float32Array(data.buffer, data.byteOffset, data.byteLength / Float32Array.BYTES_PER_ELEMENT);
  } catch (err) {
    console.error('Error reading file:', err);
    throw err;
  }
}

module.exports = {
  getOrangebeardClientSettings(configuration = {}) {
    const options = configuration.reporterOptions;
    return {
      token: process.env.ORANGEBEARD_TOKEN || options.token,
      endpoint: options.endpoint,
      testset: options.testset,
      project: options.project,
    };
  },

  getStartTestRun(options = {}) {
    return {
      testSetName: process.env.ORANGEBEARD_TESTSET || options.testset,
      description: options.description,
      attributes: options.attributes,
      startTime: this.getTime(),
    };
  },

  getTotalSpecs(config) {
    if (config.testFiles == null && config.specPattern == null) {
      throw new Error('Missing testFiles or specPattern property!');
    }

    const specPattern = getSpecPattern(config);

    const excludeSpecPattern = getExcludeSpecPattern(config);

    const options = {
      sort: true,
      absolute: true,
      nodir: true,
      ignore: [config.supportFile].concat(getFixtureFolderPattern(config)),
    };

    const doesNotMatchAllIgnoredPatterns = (file) =>
      excludeSpecPattern.every(
        (pattern) => !minimatch.minimatch(file, pattern, { dot: true, matchBase: true }),
      );

    const globResult = specPattern.reduce(
      (files, pattern) => files.concat(glob.sync(pattern, options) || []),
      [],
    );

    return globResult.filter(doesNotMatchAllIgnoredPatterns).length;
  },

  async getFailedScreenshot(testTitle) {
    const pattern = `**/*${testTitle.replace(/[",':]/g, '')} (failed).png`;
    const files = glob.sync(pattern);
    return files.length
        ? {
          name: `${testTitle} (failed)`,
          contentType: 'image/png',
          content: await getByteArray(files[0]),
        }
        : undefined;
  },

  async getVideo(folder, file) {
    return {
      name: file,
      contentType: 'video/mp4',
      content: await getByteArray(path.join(folder, file)),
    };
  },

  getTime() {
    return ZonedDateTime.now().withFixedOffsetZone().toString();
  }
}

const getFixtureFolderPattern = (config) => {
  return [].concat(config.fixturesFolder ? path.join(config.fixturesFolder, '**', '*') : []);
};

const getExcludeSpecPattern = (config) => {
  //Cy >= 10
  if (config.excludeSpecPattern) {
    const excludePattern = Array.isArray(config.excludeSpecPattern)
      ? config.excludeSpecPattern
      : [config.excludeSpecPattern];
    return [...excludePattern];
  }

  // Cy <= 9
  const ignoreTestFilesPattern = Array.isArray(config.ignoreTestFiles)
    ? config.ignoreTestFiles
    : [config.ignoreTestFiles] || [];

  return [...ignoreTestFilesPattern];
}

const getSpecPattern = (config) => {
  if (config.specPattern) {
    return [].concat(config.specPattern);
  }

  return Array.isArray(config.testFiles)
    ? config.testFiles.map((file) => path.join(config.integrationFolder, file))
    : [].concat(path.join(config.integrationFolder, config.testFiles));
}


