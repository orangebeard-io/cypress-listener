const fs = require('fs');
const path = require('path');
const glob = require('glob');
const minimatch = require('minimatch');

const base64Encode = (file) => {
  const bitmap = fs.readFileSync(file);
  return Buffer.from(bitmap).toString('base64');
};

module.exports = {
  getOrangebeardClientSettings(configuration = {}) {
    const options = configuration.reporterOptions;
    return {
      token: process.env.ORANGEBEARD_TOKEN || options.token,
      endpoint: [options.endpoint, 'listener', 'v2'].join('/'),
      launch: options.testset,
      project: options.project,
    };
  },

  getStartTestRun(options = {}) {
    return {
      launch: process.env.ORANGEBEARD_TESTSET || options.launch,
      description: options.description,
      attributes: options.attributes,
      startTime: new Date().valueOf(),
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
        (pattern) => !minimatch(file, pattern, { dot: true, matchBase: true }),
      );

    const globResult = specPattern.reduce(
      (files, pattern) => files.concat(glob.sync(pattern, options) || []),
      [],
    );

    return globResult.filter(doesNotMatchAllIgnoredPatterns).length;
  },

  getPassedScreenshots(testTitle) {
    const patternFirstScreenshot = `**/*${testTitle.replace(/[",',:]/g, '')}.png`;
    const patternNumeratedScreenshots = `**/*${testTitle.replace(/[",',:]/g, '')} (*([0-9])).png`;
    const firstScreenshot = glob.sync(patternFirstScreenshot) || [];
    const numeratedScreenshots = glob.sync(patternNumeratedScreenshots) || [];
    const files = firstScreenshot.concat(numeratedScreenshots);
    return (files || []).map((file, index) => ({
      name: `${testTitle}-${index + 1}`,
      type: 'image/png',
      content: base64Encode(file),
    }));
  },

  getFailedScreenshot(testTitle) {
    const pattern = `**/*${testTitle.replace(/[",',:]/g, '')} (failed).png`;
    const files = glob.sync(pattern);
    return files.length
      ? {
        name: `${testTitle} (failed)`,
        type: 'image/png',
        content: base64Encode(files[0]),
      }
      : undefined;
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


