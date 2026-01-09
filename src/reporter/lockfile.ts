import { UUID } from 'crypto';
import * as fs from 'node:fs';

export type LockfileOptions = {
  cleanupOldLockfiles?: boolean;
};

function listLockfiles(): string[] {
  try {
    return fs
      .readdirSync(process.cwd())
      .filter((f) => f.toLowerCase().startsWith('orangebeard-') && f.toLowerCase().endsWith('.lock'));
  } catch {
    return [];
  }
}

function cleanupOldLockfiles(): void {
  const lockfiles = listLockfiles();
  for (const f of lockfiles) {
    try {
      fs.unlinkSync(f);
    } catch {
      // ignore
    }
  }
}

export function createLockFile(tempId: UUID, options: LockfileOptions = {}): string {
  const shouldCleanup = options.cleanupOldLockfiles !== false;
  if (shouldCleanup) {
    cleanupOldLockfiles();
  }

  const existing = listLockfiles();
  if (existing.length > 0) {
    // eslint-disable-next-line no-console
    console.warn(`Previous lock file(s) present :${existing}. Is another test run still in progress?`);
  }

  const filename = `orangebeard-${tempId}.lock`;
  fs.writeFileSync(filename, '');
  return filename;
}

export function deleteLockFile(filename: string): void {
  fs.unlinkSync(filename);
}
