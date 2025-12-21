import * as path from 'node:path';
import { UUID } from 'crypto';

export type SpecSuiteIndex = Record<string, UUID>;

export function normalizeSpecKey(specKey: unknown): string | null {
  if (typeof specKey !== 'string') return null;
  const trimmed = specKey.trim();
  if (!trimmed) return null;

  // Normalize separators so keys match regardless of Windows/posix paths.
  return trimmed.replace(/\\/g, '/');
}

export function extractCypressRelativeSpecKey(key: string): string | null {
  // Convert absolute paths containing /cypress/(e2e|integration)/... into cypress/e2e/... keys.
  const match = key.match(/\/cypress\/(e2e|integration)\/(.+)$/);
  if (!match) return null;
  return `cypress/${match[1]}/${match[2]}`;
}

export function indexSpecSuite(specSuites: SpecSuiteIndex, suiteId: UUID, specKey: string): void {
  const key = normalizeSpecKey(specKey);
  if (!key) return;

  // Store a few variants so we can resolve suite UUID from Cypress after:spec payloads.
  // Cypress may send:
  // - relative: "cypress/e2e/app.cy.js"
  // - absolute: "C:/repo/.../cypress/e2e/app.cy.js"
  // while Mocha suite.file might be absolute or relative.
  specSuites[key] = suiteId;

  const rel = extractCypressRelativeSpecKey(key);
  if (rel) {
    specSuites[rel] = suiteId;

    const stripped = rel.replace(/^cypress\/(e2e|integration)\//, '');
    if (stripped && stripped !== rel) {
      specSuites[stripped] = suiteId;
    }
  }

  const base = normalizeSpecKey(path.basename(key));
  if (base && base !== key) {
    specSuites[base] = suiteId;
  }
}

export function resolveRootSuiteIdForSpec(specSuites: SpecSuiteIndex, spec: any): UUID | null {
  const candidates: Array<string | undefined> = [spec?.relative, spec?.name, spec?.fileName, spec?.absolute];

  for (const c of candidates) {
    const key = normalizeSpecKey(c);
    if (!key) continue;

    // Direct key.
    const direct = specSuites[key];
    if (direct) return direct;

    // Try stripping common Cypress prefix (matches our activeSpec indexing).
    const stripped = key.replace(/^cypress\/(e2e|integration)\//, '');
    if (stripped !== key && specSuites[stripped]) {
      return specSuites[stripped];
    }

    // Try deriving cypress/e2e/... from absolute paths.
    const rel = extractCypressRelativeSpecKey(key);
    if (rel && specSuites[rel]) {
      return specSuites[rel];
    }

    // Try basename last (least specific; can collide across folders)
    const base = path.basename(key);
    const baseKey = normalizeSpecKey(base);
    if (baseKey && specSuites[baseKey]) {
      return specSuites[baseKey];
    }
  }

  return null;
}
