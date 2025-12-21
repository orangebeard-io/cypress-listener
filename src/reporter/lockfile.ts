import { UUID } from 'crypto';
import * as fs from 'node:fs';

export function createLockFile(tempId: UUID): string {
  const lockfiles = fs
    .readdirSync(process.cwd())
    .filter((f) => f.startsWith('orangebeard-') && f.endsWith('.lock'));

  if (lockfiles.length > 0) {
    // eslint-disable-next-line no-console
    console.warn(`Previous lock file(s) present :${lockfiles}. Is another test run still in progress?`);
  }

  const filename = `orangebeard-${tempId}.lock`;
  fs.writeFileSync(filename, '');
  return filename;
}

export function deleteLockFile(filename: string): void {
  fs.unlinkSync(filename);
}
