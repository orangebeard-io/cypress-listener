export type OrangebeardPluginCallbacks = {
  screenshotLogFn?: (screenshotInfo: any) => string;

  /**
   * By default, the plugin waits in `after:run` until the reporter lockfile(s)
   * (`orangebeard-*.lock`) are gone.
   *
   * Set to `false` if you want Cypress to exit immediately and you manage waiting yourself.
   */
  waitForLockfiles?: boolean;

  /** Poll interval for checking lockfiles (default: 500ms). */
  lockfilePollIntervalMs?: number;

  /**
   * Max time to wait for lockfiles (default: 5 minutes). If exceeded, Cypress continues shutdown.
   */
  lockfileTimeoutMs?: number;
};

export type IpcConfigEvent = unknown;

export type IpcLogEvent = {
  level: 'debug' | 'info' | 'warn' | 'error';
  message: unknown;
  step?: string;
};

export type IpcCommandStepEvent = {
  event: 'start' | 'finish';
  commandId: string;
  commandName?: string;
  message?: string;
  state?: 'passed' | 'failed' | 'skipped' | string;
  testFullTitle?: string;
  wallClockStartedAt?: number;
  wallClockEndedAt?: number;
};

export type IpcScreenshotEvent = {
  logMessage?: string;
  screenshotInfo: any;
};

export type IpcSpecArtifactsEvent = {
  spec: any;
  results: any;
};
