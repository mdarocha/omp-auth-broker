import { errorMessage } from "./http";
import { logger } from "@oh-my-pi/pi-utils";

interface RequestLogFields {
    error?: unknown;
    method: string;
    startedAt: number;
    status?: number;
}

function elapsedMs(startedAt: number): number {
    return Math.round(performance.now() - startedAt);
}

function levelFor(fields: RequestLogFields): "info" | "warn" {
    if (fields.error !== undefined) {
        return "warn";
    }
    return fields.status !== undefined && fields.status >= 500 ? "warn" : "info";
}

function buildContext(fields: RequestLogFields, target: Record<string, unknown>): Record<string, unknown> {
    const context: Record<string, unknown> = {
        ...target,
        method: fields.method,
        durationMs: elapsedMs(fields.startedAt),
    };
    if (fields.status !== undefined) {
        context.status = fields.status;
    }
    if (fields.error !== undefined) {
        context.error = errorMessage(fields.error);
    }
    return context;
}

function emit(message: string, fields: RequestLogFields, target: Record<string, unknown>): void {
    const context = buildContext(fields, target);
    if (levelFor(fields) === "warn") {
        logger.warn(message, context);
    } else {
        logger.info(message, context);
    }
}

/** Log a request handled by the broker's own public server (UI, `/api/*`, proxied `/v1/*`). */
export function logIncomingRequest(fields: RequestLogFields & { path: string }): void {
    emit("incoming request", fields, { path: fields.path });
}

/** Log a request the broker itself makes, e.g. proxying to the internal auth broker listener. */
export function logOutgoingRequest(fields: RequestLogFields & { url: string }): void {
    emit("outgoing request", fields, { url: fields.url });
}
