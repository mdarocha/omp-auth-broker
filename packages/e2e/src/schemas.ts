import { z } from "zod";

const credentialSnapshotEntrySchema = z
    .object({
        credential: z.object({ type: z.string() }).passthrough(),
        id: z.number().int(),
        identityKey: z.string().nullable(),
        provider: z.string(),
    })
    .passthrough();

const usageAmountSchema = z
    .object({
        unit: z.string(),
    })
    .passthrough();

const usageLimitSchema = z
    .object({
        amount: usageAmountSchema,
        id: z.string(),
        label: z.string(),
    })
    .passthrough();

const usageReportSchema = z
    .object({
        fetchedAt: z.number(),
        limits: z.array(usageLimitSchema),
        provider: z.string(),
    })
    .passthrough();

const clientProviderUsageSchema = z
    .object({
        cacheReadTokens: z.number(),
        cacheWriteTokens: z.number(),
        costUsd: z.number(),
        inputTokens: z.number(),
        outputTokens: z.number(),
        provider: z.string(),
        requests: z.number(),
    })
    .passthrough();

const clientUsageSchema = z
    .object({
        firstSeen: z.number(),
        installId: z.string(),
        lastSeen: z.number(),
        providers: z.array(clientProviderUsageSchema),
    })
    .passthrough();

export const healthzSchema = z
    .object({
        ok: z.boolean(),
        version: z.string().optional(),
    })
    .passthrough();

export const snapshotCredentialSchema = credentialSnapshotEntrySchema
    .extend({
        rotatesInMs: z.number().nullable(),
    })
    .passthrough();

export const snapshotSchema = z
    .object({
        credentials: z.array(snapshotCredentialSchema),
    })
    .passthrough();

export const usageSchema = z
    .object({
        generatedAt: z.number(),
        reports: z.array(usageReportSchema),
    })
    .passthrough();

export const clientUsageSummarySchema = z
    .object({
        clients: z.array(clientUsageSchema),
        generatedAt: z.number(),
    })
    .passthrough();

export const providerSchema = z
    .object({
        id: z.string(),
        name: z.string(),
        pasteCode: z.boolean(),
    })
    .passthrough();

export const providersSchema = z.array(providerSchema);

export const apiUsageSchema = usageSchema
    .extend({
        clients: z.array(clientUsageSchema),
    })
    .passthrough();

export const loginStartSchema = z
    .object({
        needsCode: z.boolean(),
        sessionId: z.string().min(1),
        url: z.string().url(),
    })
    .passthrough();

export const loginStatusSchema = z
    .object({
        message: z.string().optional(),
        needsCode: z.boolean(),
        state: z.enum(["pending", "done", "error"]),
    })
    .passthrough();

export const credentialRefreshSchema = z
    .object({
        entry: credentialSnapshotEntrySchema,
    })
    .passthrough();

export const okSchema = z
    .object({
        ok: z.boolean(),
    })
    .passthrough();
