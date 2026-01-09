import type { Attribute } from '@orangebeard-io/javascript-client/dist/client/models/Attribute';

export function extractCypressTags(test: any): string[] {
  const candidates: unknown[] = [
    test?.tags,
    test?.tag,
    test?.config?.tags,
    test?._testConfig?.tags,
    test?._testConfig?.unverifiedTestConfig?.tags,
    test?._testConfig?.testConfig?.tags,
    test?._testConfig?.resolved?.tags,
    test?.invocationDetails?.tags,
  ];

  // Collect tags from all candidate locations (some plugins/frameworks store tags in multiple places).
  const seen = new Set<string>();

  const add = (value: string) => {
    const t = value.trim();
    if (!t) return;
    if (seen.has(t)) return;
    seen.add(t);
  };

  for (const c of candidates) {
    if (Array.isArray(c)) {
      for (const item of c) {
        if (typeof item === 'string') add(item);
      }
      continue;
    }

    if (typeof c === 'string' && c.trim()) {
      // allow comma-separated string
      for (const part of c.split(',')) {
        if (typeof part === 'string') add(part);
      }
    }
  }

  return Array.from(seen);
}

export function tagsToAttributes(tags: string[]): Attribute[] {
  const attrs: Attribute[] = [];

  for (const raw of tags) {
    if (typeof raw !== 'string') continue;

    let t = raw.trim();
    if (!t) continue;
    if (t.startsWith('@')) t = t.slice(1);
    t = t.trim();
    if (!t) continue;

    const idx = t.indexOf(':');
    if (idx > 0) {
      const key = t.slice(0, idx).trim();
      const value = t.slice(idx + 1).trim();

      if (key && value) {
        attrs.push({ key, value });
        continue;
      }

      // If malformed (no key or no value), fall back to value-only.
      const fallback = (key || value).trim();
      if (fallback) attrs.push({ value: fallback });
      continue;
    }

    attrs.push({ value: t });
  }

  // de-dupe
  const seen = new Set<string>();
  const unique: Attribute[] = [];
  for (const a of attrs) {
    const k = `${a.key ?? ''}:${a.value ?? ''}`;
    if (seen.has(k)) continue;
    seen.add(k);
    unique.push(a);
  }

  return unique;
}

export function getAttributesFromTags(entity: any): Attribute[] {
  return tagsToAttributes(extractCypressTags(entity));
}

export function getTestAttributesFromTags(test: any): Attribute[] {
  return getAttributesFromTags(test);
}

export function getSuiteAttributesFromTags(suite: any): Attribute[] {
  return getAttributesFromTags(suite);
}
