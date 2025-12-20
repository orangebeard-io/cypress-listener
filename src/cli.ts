import OrangebeardClient from '@orangebeard-io/javascript-client/dist/client/OrangebeardClient';

import { getTime } from './utils';

type CliOptions = {
  endpoint?: string;
  token?: string;
  project?: string;
  testset?: string;
  description?: string;
  testRunUUID?: string;
  attributes?: string[];
};

function printUsageAndExit(exitCode: number): never {
  // eslint-disable-next-line no-console
  console.error(
    [
      'Usage:',
      '  ob-cypress start-run [--endpoint <url>] [--token <token>] [--project <project>] [--testset <name>] [--description <text>] [--attributes k=v,k=v]',
      '  ob-cypress finish-run --testRunUUID <uuid> [--endpoint <url>] [--token <token>] [--project <project>]',
      '',
      'Notes:',
      '  - Any option can be provided via env vars ORANGEBEARD_ENDPOINT, ORANGEBEARD_TOKEN, ORANGEBEARD_PROJECT, ORANGEBEARD_TESTSET.',
    ].join('\n'),
  );
  process.exit(exitCode);
}

function parseArgs(argv: string[]): { cmd: string; options: CliOptions } {
  const [cmd, ...rest] = argv;
  if (!cmd) printUsageAndExit(1);

  const options: CliOptions = {};

  for (let i = 0; i < rest.length; i += 1) {
    const arg = rest[i];
    if (!arg.startsWith('--')) continue;

    const key = arg.slice(2);
    const value = rest[i + 1];
    if (!value || value.startsWith('--')) {
      (options as any)[key] = true;
      continue;
    }

    i += 1;

    if (key === 'attributes') {
      options.attributes = value
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      continue;
    }

    (options as any)[key] = value;
  }

  return { cmd, options };
}

function requireString(value: string | undefined, name: string): string {
  if (!value) {
    // eslint-disable-next-line no-console
    console.error(`Missing required option: ${name}`);
    printUsageAndExit(1);
  }
  return value;
}

function getConfig(options: CliOptions): Required<Pick<CliOptions, 'endpoint' | 'token' | 'project'>> {
  return {
    endpoint: options.endpoint ?? process.env.ORANGEBEARD_ENDPOINT ?? (process.env.ORANGEBEARD_URL as string | undefined),
    token: options.token ?? process.env.ORANGEBEARD_TOKEN,
    project: options.project ?? process.env.ORANGEBEARD_PROJECT,
  } as any;
}

async function main(): Promise<void> {
  const { cmd, options } = parseArgs(process.argv.slice(2));
  if (cmd === 'help' || cmd === '--help' || cmd === '-h') {
    printUsageAndExit(0);
  }

  const { endpoint, token, project } = getConfig(options);
  const client = new OrangebeardClient(
    requireString(endpoint, 'endpoint'),
    requireString(token, 'token'),
    requireString(project, 'project'),
  );

  if (cmd === 'start-run') {
    const testset = options.testset ?? process.env.ORANGEBEARD_TESTSET;

    const uuid = await client.startTestRun({
      testSetName: requireString(testset, 'testset'),
      description: options.description,
      startTime: getTime(),
      attributes: options.attributes?.map((value) => ({ value })),
    } as any);

    if (!uuid) {
      // eslint-disable-next-line no-console
      console.error('Failed to start Orangebeard test run (no UUID returned).');
      process.exit(2);
    }

    // eslint-disable-next-line no-console
    console.log(String(uuid));
    return;
  }

  if (cmd === 'finish-run') {
    const testRunUUID = requireString(options.testRunUUID ?? process.env.ORANGEBEARD_TEST_RUN_UUID, 'testRunUUID');
    await client.finishTestRun(testRunUUID as any, { endTime: getTime() } as any);
    return;
  }

  // eslint-disable-next-line no-console
  console.error(`Unknown command: ${cmd}`);
  printUsageAndExit(1);
}

// eslint-disable-next-line @typescript-eslint/no-floating-promises
main();
