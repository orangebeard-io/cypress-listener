export const IPC_EVENTS = {
  CONFIG: 'config',
  LOG: 'log',
  COMMAND_STEP: 'commandStep',
  SCREENSHOT: 'screenshot',
  SPEC_ARTIFACTS: 'specArtifacts',
  RUN_END: 'runEnd',
  // Barrier pair used by the reporter to prove every LOG/COMMAND_STEP/SCREENSHOT message the
  // plugin has already sent has actually been received (and its handler invoked) before the
  // reporter decides what's still in-flight. See OrangebeardCypressReporter.requestFlushAck().
  FLUSH: 'flush',
  FLUSH_ACK: 'flushAck',
} as const;

export type IpcEventName = (typeof IPC_EVENTS)[keyof typeof IPC_EVENTS];
