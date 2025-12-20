import * as fs from 'node:fs';
import * as path from 'node:path';
import * as glob from 'glob';
import * as minimatch from 'minimatch';
import { ZonedDateTime } from '@js-joda/core';

import type { Attribute } from '@orangebeard-io/javascript-client/dist/client/models/Attribute';
import type { OrangebeardParameters } from '@orangebeard-io/javascript-client/dist/client/models/OrangebeardParameters';
import type { StartTestRun } from '@orangebeard-io/javascript-client/dist/client/models/StartTestRun';
import autoConfig from '@orangebeard-io/javascript-client/dist/client/util/autoConfig';

import { promisify } from 'node:util';

const stat = promisify(fs.stat);
const access = promisify(fs.access);

async function fileExists(filepath: string): Promise<boolean> {
  try {
    await access(filepath, fs.constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

async function waitForFile(filepath: string, interval = 1000, timeout = 60000): Promise<void> {
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
}

export async function getBytes(filePath: string): Promise<Buffer> {
  await waitForFile(filePath, 100, 5000);
  return fs.readFileSync(filePath);
}

export function getTime(): string {
  return ZonedDateTime.now().withFixedOffsetZone().toString();
}

export function getOrangebeardClientSettings(configuration: any = {}): OrangebeardParameters {
  const options = configuration.reporterOptions ?? {};

  // Base config is resolved the same way as the Playwright listener:
  // - search for `orangebeard.json` from CWD upwards
  // - override/extend with ORANGEBEARD_* env vars
  const base: OrangebeardParameters = { ...(autoConfig as any) };

  // Backwards compatible: allow reporterOptions to override connection settings.
  const merged: OrangebeardParameters = {
    ...base,
    token: options.token ?? base.token,
    endpoint: options.endpoint ?? base.endpoint,
    project: options.project ?? base.project,
    testset: options.testset ?? base.testset,
    description: options.description ?? base.description,
    referenceUrl: options.referenceUrl ?? base.referenceUrl,
  };

  const baseAttrs = (base.attributes ?? []) as Attribute[];
  const optAttrs = (options.attributes ?? []) as Attribute[];
  merged.attributes = baseAttrs.concat(optAttrs);

  // Mirror javascript-client behavior: if referenceUrl is set, add it as an attribute.
  if (merged.referenceUrl !== undefined) {
    const already = (merged.attributes ?? []).some(
      (a) => a?.key === 'reference_url' && a?.value === merged.referenceUrl,
    );
    if (!already) {
      merged.attributes = (merged.attributes ?? []).concat({
        key: 'reference_url',
        value: merged.referenceUrl,
      });
    }
  }

  return merged;
}

export function getStartTestRun(params: {
  testset: string;
  description?: string;
  attributes?: any;
}): StartTestRun {
  return {
    testSetName: params.testset,
    description: params.description,
    attributes: params.attributes,
    startTime: getTime(),
  };
}

export function getTotalSpecs(config: any): number {
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

  const doesNotMatchAllIgnoredPatterns = (file: string) =>
    excludeSpecPattern.every(
      (pattern: string) => !minimatch.minimatch(file, pattern, { dot: true, matchBase: true }),
    );

  const globResult = specPattern.reduce(
    (files: string[], pattern: string) => files.concat(glob.sync(pattern, options as any) || []),
    [],
  );

  return globResult.filter(doesNotMatchAllIgnoredPatterns).length;
}

export async function getFailedScreenshot(testTitle: string): Promise<
  | {
      name: string;
      contentType: string;
      content: Buffer;
    }
  | undefined
> {
  const pattern = `**/*${testTitle.replace(/[\",':]/g, '')} (failed).png`;
  const files = glob.sync(pattern);

  if (!files.length) return undefined;

  return {
    name: `${testTitle} (failed)`,
    contentType: 'image/png',
    content: await getBytes(files[0]),
  };
}

export async function getVideo(folder: string, file: string): Promise<{ name: string; contentType: string; content: Buffer }> {
  return {
    name: file,
    contentType: 'video/mp4',
    content: await getBytes(path.join(folder, file)),
  };
}

function getFixtureFolderPattern(config: any): string[] {
  return config.fixturesFolder ? [path.join(config.fixturesFolder, '**', '*')] : [];
}

function getExcludeSpecPattern(config: any): string[] {
  // Cypress >= 10
  if (config.excludeSpecPattern) {
    const excludePattern = Array.isArray(config.excludeSpecPattern)
      ? config.excludeSpecPattern
      : [config.excludeSpecPattern];
    return [...excludePattern];
  }

  // Cypress <= 9
  const ignoreTestFilesPattern =
    config.ignoreTestFiles == null ? [] : ([] as string[]).concat(config.ignoreTestFiles);

  return [...ignoreTestFilesPattern];
}

function getSpecPattern(config: any): string[] {
  if (config.specPattern) {
    return [].concat(config.specPattern);
  }

  if (Array.isArray(config.testFiles)) {
    return config.testFiles.map((file: string) => path.join(config.integrationFolder, file));
  }

  return config.testFiles ? [path.join(config.integrationFolder, config.testFiles)] : [];
}
