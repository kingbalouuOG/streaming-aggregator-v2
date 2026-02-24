/**
 * Debug logger — sends structured log entries to the local debug server (port 3001).
 * Dev-only: no-ops in production. Non-blocking: fire-and-forget. Still calls console.* too.
 */

const DEBUG_SERVER = 'http://localhost:3001';
const IS_DEV = import.meta.env?.DEV;

// Buffer entries and flush periodically to reduce HTTP overhead
let buffer: LogEntry[] = [];
let flushTimer: ReturnType<typeof setTimeout> | null = null;
const FLUSH_INTERVAL = 500; // ms
const FLUSH_SIZE = 20; // flush if buffer reaches this size

interface LogEntry {
  timestamp: string;
  source: string;
  level: 'info' | 'warn' | 'error' | 'debug';
  message: string;
  data?: unknown;
}

function flush() {
  if (buffer.length === 0) return;
  const entries = buffer;
  buffer = [];
  if (flushTimer) {
    clearTimeout(flushTimer);
    flushTimer = null;
  }
  // Fire-and-forget
  fetch(`${DEBUG_SERVER}/log/batch`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(entries),
  }).catch(() => { /* debug server not running — ignore */ });
}

function scheduleFlush() {
  if (flushTimer) return;
  flushTimer = setTimeout(flush, FLUSH_INTERVAL);
}

function send(level: LogEntry['level'], source: string, message: string, data?: unknown) {
  if (!IS_DEV) return;

  const entry: LogEntry = {
    timestamp: new Date().toISOString(),
    source,
    level,
    message,
    ...(data !== undefined && { data }),
  };

  // Console output (always, so Chrome devtools still work)
  const tag = `[${source}]`;
  switch (level) {
    case 'error': console.error(tag, message, data ?? ''); break;
    case 'warn': console.warn(tag, message, data ?? ''); break;
    case 'debug': console.debug(tag, message, data ?? ''); break;
    default: console.log(tag, message, data ?? '');
  }

  // Buffer for batch send to debug server
  buffer.push(entry);
  if (buffer.length >= FLUSH_SIZE) {
    flush();
  } else {
    scheduleFlush();
  }
}

export const debug = {
  info: (source: string, message: string, data?: unknown) => send('info', source, message, data),
  warn: (source: string, message: string, data?: unknown) => send('warn', source, message, data),
  error: (source: string, message: string, data?: unknown) => send('error', source, message, data),
  debug: (source: string, message: string, data?: unknown) => send('debug', source, message, data),
  /** Force-flush any buffered entries now */
  flush,
};
