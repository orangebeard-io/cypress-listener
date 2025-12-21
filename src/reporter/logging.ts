import { level } from '../constants';

export type NormalizedIncomingLog = {
  level: string;
  message: string;
  logFormat: 'PLAIN_TEXT' | 'MARKDOWN';
};

export type ParsedErrorLog = {
  message: string;
  logFormat: 'PLAIN_TEXT' | 'MARKDOWN';
};

export function formatAsMarkdownCodeBlock(code: string, lang = 'js'): string {
  // Avoid accidental closing fences.
  const safe = String(code ?? '').replace(/```/g, '\\`\\`\\`');
  return `\`\`\`${lang}\n${safe}\n\`\`\``;
}

export function formatAsMarkdownJson(value: unknown): string {
  try {
    const json = JSON.stringify(value, null, 2);
    return formatAsMarkdownCodeBlock(json, 'json');
  } catch {
    return formatAsMarkdownCodeBlock(String(value), 'text');
  }
}

export function normalizeIncomingLog(log: any): NormalizedIncomingLog {
  const requested = String(log?.level ?? '').toLowerCase();
  const mapped =
    requested === 'debug'
      ? level.DEBUG
      : requested === 'warn'
        ? level.WARN
        : requested === 'error'
          ? level.ERROR
          : level.INFO;

  const msg = log?.message;
  if (typeof msg === 'string') {
    return { level: mapped, message: msg, logFormat: 'PLAIN_TEXT' };
  }

  if (msg === undefined) {
    return { level: mapped, message: '', logFormat: 'PLAIN_TEXT' };
  }

  return { level: mapped, message: formatAsMarkdownJson(msg), logFormat: 'MARKDOWN' };
}

export function parseErrorLog(err: any): ParsedErrorLog {
  if (err?.codeFrame) {
    const header = `**[${err.name}:${err.type}]** ${err.message}`;
    const location = `File: ${err.codeFrame.relativeFile || 'unknown file'}`;
    const ref = `Reference (ln ${err.codeFrame.line}, col ${err.codeFrame.column}):`;
    const code = formatAsMarkdownCodeBlock(err.codeFrame.frame, 'js');

    return {
      logFormat: 'MARKDOWN',
      message: `${header}\n\n${location}\n\n${ref}\n\n${code}`,
    };
  }

  const fallback = `[${err?.name ?? 'Error'}:${err?.type ?? 'unknown'}] ${err?.message ?? String(err)}`;
  return { logFormat: 'PLAIN_TEXT', message: fallback };
}

export type ErrorLogEntry = {
  level: string;
  message: string;
  logFormat: 'PLAIN_TEXT' | 'MARKDOWN';
};

export function buildErrorLogs(err: any): ErrorLogEntry[] {
  const parsed = parseErrorLog(err);

  const entries: ErrorLogEntry[] = [
    {
      level: level.ERROR,
      message: parsed.message,
      logFormat: parsed.logFormat,
    },
  ];

  if (err?.stack && typeof err.stack === 'string' && err.stack.trim()) {
    const stack = formatAsMarkdownCodeBlock(err.stack, 'text');
    entries.push({
      level: level.ERROR,
      message: `**Stack trace**\n\n${stack}`,
      logFormat: 'MARKDOWN',
    });
  }

  if (err && typeof err === 'object') {
    const details: Record<string, unknown> = {};
    for (const k of ['actual', 'expected', 'operator']) {
      if (k in err) details[k] = (err as any)[k];
    }
    if (Object.keys(details).length > 0) {
      entries.push({
        level: level.ERROR,
        message: `**Assertion details**\n\n${formatAsMarkdownJson(details)}`,
        logFormat: 'MARKDOWN',
      });
    }
  }

  return entries;
}
