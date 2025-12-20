export const IPC_EVENTS = {
  CONFIG: 'config',
  LOG: 'log',
  SCREENSHOT: 'screenshot',
  SPEC_ARTIFACTS: 'specArtifacts',
} as const;

export type IpcEventName = (typeof IPC_EVENTS)[keyof typeof IPC_EVENTS];
