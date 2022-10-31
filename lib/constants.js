const status = {
    PASSED: 'passed',
    FAILED: 'failed',
    SKIPPED: 'skipped',
  };
  const level = {
    ERROR: 'error',
    DEBUG: 'debug',
    INFO: 'info',
    WARN: 'warn',
  };
  const testEntity = {
    SUITE: 'suite',
    TEST: 'test',
    STEP: 'step',
    BEFORE_METHOD: 'BEFORE_METHOD',
    BEFORE_SUITE: 'BEFORE_SUITE',
    AFTER_METHOD: 'AFTER_METHOD',
    AFTER_SUITE: 'AFTER_SUITE',
  };
  
  const hooks = {
    BEFORE_ALL: 'before all',
    BEFORE_EACH: 'before each',
    AFTER_ALL: 'after all',
    AFTER_EACH: 'after each',
  };
  
  const hookToTestEntity = {
    [hooks.BEFORE_EACH]: testEntity.BEFORE_METHOD,
    [hooks.BEFORE_ALL]: testEntity.BEFORE_SUITE,
    [hooks.AFTER_EACH]: testEntity.AFTER_METHOD,
    [hooks.AFTER_ALL]: testEntity.AFTER_SUITE,
  };
  
  module.exports = {
    status,
    level,
    testEntity,
    hookToTestEntity,
  };