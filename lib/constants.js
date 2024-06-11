const status = {
    PASSED: 'PASSED',
    FAILED: 'FAILED',
    SKIPPED: 'SKIPPED',
  };
  const level = {
    ERROR: 'ERROR',
    DEBUG: 'DEBUG',
    INFO: 'INFO',
    WARN: 'WARN',
  };
  const testEntity = {
    SUITE: 'SUITE',
    TEST: 'TEST',
    STEP: 'STEP',
    BEFORE_METHOD: 'BEFORE',
    AFTER_METHOD: 'AFTER',
  };

  const hooks = {
    BEFORE_ALL: 'before all',
    BEFORE_EACH: 'before each',
    AFTER_ALL: 'after all',
    AFTER_EACH: 'after each',
  };

  const hookToTestEntity = {
    [hooks.BEFORE_EACH]: testEntity.BEFORE_METHOD,
    [hooks.AFTER_EACH]: testEntity.AFTER_METHOD,
  };

  module.exports = {
    status,
    level,
    testEntity,
    hookToTestEntity,
  };
