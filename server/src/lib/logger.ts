/**
 * Minimal structured logger. JSON lines in production (Railway, Fly and most
 * log drains parse them natively), readable lines in development.
 *
 * Never pass raw phone numbers, transcripts or tokens as fields; use
 * `maskPhone` from the domain layer.
 */

type Level = "debug" | "info" | "warn" | "error";
type Fields = Record<string, unknown>;

export interface Logger {
  debug(event: string, fields?: Fields): void;
  info(event: string, fields?: Fields): void;
  warn(event: string, fields?: Fields): void;
  error(event: string, fields?: Fields): void;
  child(fields: Fields): Logger;
}

const ORDER: Record<Level, number> = { debug: 10, info: 20, warn: 30, error: 40 };

export function serializeError(err: unknown): Fields {
  if (err instanceof Error) return { error: err.message, errorName: err.name };
  return { error: String(err) };
}

export function createLogger(options: { format: "json" | "pretty"; level?: Level; base?: Fields }): Logger {
  const min = ORDER[options.level ?? "info"];

  const write = (level: Level, event: string, fields: Fields = {}) => {
    if (ORDER[level] < min) return;
    const record = { ...options.base, ...fields };
    const stream = level === "error" || level === "warn" ? process.stderr : process.stdout;
    if (options.format === "json") {
      stream.write(`${JSON.stringify({ time: new Date().toISOString(), level, event, ...record })}\n`);
    } else {
      const extras = Object.keys(record).length ? ` ${JSON.stringify(record)}` : "";
      stream.write(`${level.toUpperCase().padEnd(5)} ${event}${extras}\n`);
    }
  };

  return {
    debug: (e, f) => write("debug", e, f),
    info: (e, f) => write("info", e, f),
    warn: (e, f) => write("warn", e, f),
    error: (e, f) => write("error", e, f),
    child: (fields) => createLogger({ ...options, base: { ...options.base, ...fields } }),
  };
}

/** Logger that drops everything. Handy in tests. */
export const silentLogger: Logger = {
  debug() {},
  info() {},
  warn() {},
  error() {},
  child: () => silentLogger,
};
