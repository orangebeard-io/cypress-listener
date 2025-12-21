import * as path from 'node:path';
import { UUID } from 'crypto';

export type TestNameIndex = Map<string, UUID>;

export function normalizeNameKey(name: string): string | null {
  if (typeof name !== 'string') return null;
  const trimmed = name.trim();
  if (!trimmed) return null;
  return trimmed;
}

export function getLastTitleSegment(name: string): string | null {
  // Cypress screenshot titles use " -- " between suite levels.
  const parts = name.split(' -- ').map((p) => p.trim()).filter(Boolean);
  if (parts.length === 0) return null;
  return parts[parts.length - 1];
}

export function indexTestName(index: TestNameIndex, testId: UUID, name: string): void {
  const key = normalizeNameKey(name);
  if (!key) return;
  index.set(key, testId);

  // Also index just the last segment of a "suite -- test" name.
  const last = getLastTitleSegment(key);
  if (last && last !== key) {
    index.set(last, testId);
  }
}

export function resolveTestIdForNameKey(index: TestNameIndex, name: string): UUID | null {
  const key = normalizeNameKey(name);
  if (!key) return null;

  const direct = index.get(key);
  if (direct) return direct;

  const last = getLastTitleSegment(key);
  if (!last) return null;
  return index.get(last) ?? null;
}

export function resolveTestIdForScreenshotPath(index: TestNameIndex, screenshotPath: string): UUID | null {
  const base = path.basename(screenshotPath);
  const noExt = base.replace(/\.[^.]+$/, '');
  const withoutFailed = noExt.endsWith(' (failed)') ? noExt.slice(0, -' (failed)'.length) : noExt;
  return resolveTestIdForNameKey(index, withoutFailed);
}
