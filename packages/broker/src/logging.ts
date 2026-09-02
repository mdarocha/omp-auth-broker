import type { LogEvent, LogLevel } from "@oh-my-pi/pi-utils/logger";
import { registerLogSink, setTransports } from "@oh-my-pi/pi-utils/logger";
import { AsyncLocalStorage } from "node:async_hooks";
import chalk from "@oh-my-pi/pi-utils/chalk";

export type LogFormat = "pretty" | "json";
type LogSource = "auth-broker" | "gateway";

/**
 * Fallback only: every log line inside @oh-my-pi/pi-ai's auth-broker submodule is written with
 * this prefix. `runAsAuthBroker` below is the primary, wording-independent signal; this regex
 * only catches auth-broker-submodule logs that fire outside that scope (e.g. peer-discovery
 * polling triggered by AuthStorage itself, not by the listener we start).
 */
const AUTH_BROKER_MESSAGE_PATTERN = /^auth[- ]broker\s*/i;

const LEVEL_LABELS: Record<LogLevel, string> = {
    debug: "DEBUG",
    error: "ERROR",
    info: "INFO",
    warn: "WARN",
};

const LEVEL_STYLES: Record<LogLevel, (text: string) => string> = {
    debug: (text) => chalk.gray(text),
    error: (text) => chalk.bold.red(text),
    info: (text) => chalk.cyan(text),
    warn: (text) => chalk.yellow(text),
};

const SOURCE_STYLES: Record<LogSource, (text: string) => string> = {
    "auth-broker": (text) => chalk.magenta(text),
    gateway: (text) => chalk.blueBright(text),
};

/**
 * Bun's `Bun.serve()` and `setTimeout`/`setInterval` both capture the AsyncLocalStorage context
 * active when they're *created*, not when they fire, so tagging the synchronous `startAuthBroker`
 * call below reliably tags every request the internal listener later handles and every timer it
 * schedules (its token refresher, its external-change poller) — independent of what those log
 * lines say.
 */
const authBrokerContext = new AsyncLocalStorage<true>();

/** Run `fn` tagged as the internal auth broker listener, for every log line it emits, sync or async. */
export function runAsAuthBroker<T>(fn: () => T): T {
    return authBrokerContext.run(true, fn);
}

let format: LogFormat = "pretty";
let initialized = false;

/** Switch how subsequent log lines render. Safe to call before or after {@link initLogging}. */
export function setLogFormat(next: LogFormat): void {
    format = next;
}

/**
 * Take over console rendering from `@oh-my-pi/pi-utils`'s default JSON-line writer: disable its
 * built-in transports and render every log event (ours and the internal auth broker's) ourselves,
 * so both share one readable, source-tagged, optionally-colored format. Idempotent.
 */
export function initLogging(): void {
    if (initialized) {
        return;
    }
    initialized = true;
    setTransports({ console: false, file: false });
    registerLogSink((event) => {
        process.stdout.write(format === "json" ? renderJson(event) : renderPretty(event));
    });
}

function sourceOf(message: string): LogSource {
    if (authBrokerContext.getStore()) {
        return "auth-broker";
    }
    return AUTH_BROKER_MESSAGE_PATTERN.test(message) ? "auth-broker" : "gateway";
}

function jsonReplacer(_key: string, value: unknown): unknown {
    if (value instanceof Error) {
        return { message: value.message, name: value.name, stack: value.stack };
    }
    return value;
}

function renderJson(event: LogEvent): string {
    const { context, level, message, timestamp } = event;
    const entry = {
        timestamp: timestamp.toISOString(),
        level,
        pid: process.pid,
        source: sourceOf(message),
        message,
        ...context,
    };
    return `${JSON.stringify(entry, jsonReplacer)}\n`;
}

function padTimePart(value: number, width = 2): string {
    return String(value).padStart(width, "0");
}

function formatTimestamp(date: Date): string {
    return (
        `${padTimePart(date.getHours())}:${padTimePart(date.getMinutes())}:${padTimePart(date.getSeconds())}` +
        `.${padTimePart(date.getMilliseconds(), 3)}`
    );
}

function formatContextValue(value: unknown): string {
    if (typeof value === "string") {
        return /\s/.test(value) ? JSON.stringify(value) : value;
    }
    if (value instanceof Error) {
        return value.message;
    }
    if (typeof value === "object" && value !== null) {
        try {
            return JSON.stringify(value);
        } catch {
            return "[unserializable]";
        }
    }
    return String(value);
}

function formatContext(context: Record<string, unknown> | undefined): string {
    if (!context) {
        return "";
    }
    const entries = Object.entries(context).filter(([, value]) => value !== undefined);
    if (entries.length === 0) {
        return "";
    }
    const rendered = entries.map(([key, value]) => `${key}=${formatContextValue(value)}`).join(" ");
    return ` ${chalk.dim(rendered)}`;
}

function renderPretty(event: LogEvent): string {
    const source = sourceOf(event.message);
    const timestamp = chalk.dim(formatTimestamp(event.timestamp));
    const level = LEVEL_STYLES[event.level](LEVEL_LABELS[event.level].padEnd(5));
    const tag = SOURCE_STYLES[source](`[${source}]`.padEnd(13));
    // Strip the redundant "auth-broker " prefix from upstream messages; the tag already says it.
    const message = event.message.replace(AUTH_BROKER_MESSAGE_PATTERN, "");
    return `${timestamp} ${level} ${tag} ${message}${formatContext(event.context)}\n`;
}
