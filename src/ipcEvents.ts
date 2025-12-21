export const IPC_EVENTS = {
  CONFIG: 'config',
  LOG: 'log',
  COMMAND_STEP: 'commandStep',
  SCREENSHOT: 'screenshot',
  SPEC_ARTIFACTS: 'specArtifacts',
} as const;

export type IpcEventName = (typeof IPC_EVENTS)[keyof typeof IPC_EVENTS];
