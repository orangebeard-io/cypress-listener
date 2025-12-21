import { UUID } from 'crypto';

import { level, status } from '../constants';

export type CommandStepTrackerDeps = {
  isDisabled: () => boolean;
  getTime: () => string;
  getTestRunUUID: () => UUID;
  getCurrentTestUUID: () => UUID | null;
  resolveTestIdForNameKey: (name: string) => UUID | null;

  startStep: (payload: any) => UUID;
  finishStep: (stepId: UUID, payload: any) => void;
  logMessage: (
    testId: UUID | null,
    message: any,
    logLevel: string,
    stepId?: UUID | null,
    logFormat?: 'PLAIN_TEXT' | 'MARKDOWN',
  ) => UUID;
  formatAsMarkdownJson: (value: unknown) => string;
};

export class CommandStepTracker {
  private readonly deps: CommandStepTrackerDeps;
  private readonly commandSteps: Map<string, UUID> = new Map();

  constructor(deps: CommandStepTrackerDeps) {
    this.deps = deps;
  }

  handleEvent(evt: any): void {
    if (this.deps.isDisabled()) return;
    if (!evt || typeof evt !== 'object') return;

    const event = evt.event;
    const commandId = evt.commandId;
    if ((event !== 'start' && event !== 'finish') || typeof commandId !== 'string' || !commandId) return;

    if (event === 'start') {
      if (this.commandSteps.has(commandId)) return;

      const resolvedTestId =
        typeof evt.testFullTitle === 'string' ? this.deps.resolveTestIdForNameKey(evt.testFullTitle) : null;
      const testId = resolvedTestId ?? this.deps.getCurrentTestUUID();
      if (!testId) return;

      const commandName = typeof evt.commandName === 'string' && evt.commandName.trim() ? evt.commandName.trim() : null;
      const stepName = commandName ?? 'Cypress command';

      const stepId = this.deps.startStep({
        testRunUUID: this.deps.getTestRunUUID(),
        testUUID: testId,
        stepName,
        startTime: this.deps.getTime(),
      } as any);

      this.commandSteps.set(commandId, stepId);

      if (evt.message !== undefined && evt.message !== null && String(evt.message).trim()) {
        if (typeof evt.message === 'string') {
          this.deps.logMessage(testId, String(evt.message), level.INFO, stepId, 'PLAIN_TEXT');
        } else {
          this.deps.logMessage(
            testId,
            this.deps.formatAsMarkdownJson(evt.message),
            level.INFO,
            stepId,
            'MARKDOWN',
          );
        }
      }

      return;
    }

    // finish
    const stepId = this.commandSteps.get(commandId);
    if (!stepId) return;

    const state = String(evt.state ?? '').toLowerCase();
    const stepStatus = state === 'failed' ? status.FAILED : state === 'skipped' ? status.SKIPPED : status.PASSED;

    this.deps.finishStep(stepId, {
      testRunUUID: this.deps.getTestRunUUID(),
      status: stepStatus,
      endTime: this.deps.getTime(),
    } as any);

    this.commandSteps.delete(commandId);
  }

  cleanupDanglingSteps(): void {
    if (this.deps.isDisabled()) return;

    for (const [commandId, stepId] of this.commandSteps.entries()) {
      this.deps.finishStep(stepId, {
        testRunUUID: this.deps.getTestRunUUID(),
        status: status.STOPPED,
        endTime: this.deps.getTime(),
      } as any);

      this.commandSteps.delete(commandId);
    }
  }
}
