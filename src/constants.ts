export const status = {
  PASSED: 'PASSED',
  FAILED: 'FAILED',
  SKIPPED: 'SKIPPED',
  STOPPED: 'STOPPED',
  TIMED_OUT: 'TIMED_OUT',
} as const;

export const level = {
  ERROR: 'ERROR',
  DEBUG: 'DEBUG',
  INFO: 'INFO',
  WARN: 'WARN',
} as const;

export const testEntity = {
  SUITE: 'SUITE',
  TEST: 'TEST',
  STEP: 'STEP',
  BEFORE_METHOD: 'BEFORE',
  AFTER_METHOD: 'AFTER',
  BEFORE: 'BEFORE',
  AFTER: 'AFTER',
} as const;

export const hooks = {
  BEFORE_ALL: 'before all',
  BEFORE_EACH: 'before each',
  AFTER_ALL: 'after all',
  AFTER_EACH: 'after each',
} as const;

export const hookToTestEntity = {
  [hooks.BEFORE_EACH]: testEntity.BEFORE_METHOD,
  [hooks.AFTER_EACH]: testEntity.AFTER_METHOD,
} as const;
