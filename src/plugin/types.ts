export type OrangebeardPluginCallbacks = {
  screenshotLogFn?: (screenshotInfo: any) => string;
};

export type IpcConfigEvent = unknown;

export type IpcLogEvent = {
  level: 'debug' | 'info' | 'warn' | 'error';
  message: string;
  step?: string;
};

export type IpcScreenshotEvent = {
  logMessage?: string;
  screenshotInfo: any;
};

export type IpcSpecArtifactsEvent = {
  spec: any;
  results: any;
};
