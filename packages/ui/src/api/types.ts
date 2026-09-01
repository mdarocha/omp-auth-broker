import { z } from "zod";

export const providerSchema = z
    .object({
        id: z.string(),
        name: z.string(),
        pasteCode: z.boolean(),
    })
    .passthrough();

export const providersSchema = z.array(providerSchema);

export type Provider = z.infer<typeof providerSchema>;

export const credentialDetailSchema = z
    .object({
        accountId: z.string().optional(),
        disabled: z.boolean().optional(),
        email: z.string().optional(),
        expires: z.number().optional(),
        orgName: z.string().optional(),
        type: z.string(),
    })
    .passthrough();

export type CredentialDetail = z.infer<typeof credentialDetailSchema>;

export const credentialSchema = z
    .object({
        credential: credentialDetailSchema,
        disabled: z.boolean().optional(),
        id: z.number(),
        identityKey: z.string().nullable().optional(),
        provider: z.string(),
        rotatesInMs: z.number().nullable(),
    })
    .passthrough();

export type Credential = z.infer<typeof credentialSchema>;

export const snapshotSchema = z
    .object({
        credentials: z.array(credentialSchema),
        generatedAt: z.number().optional(),
    })
    .passthrough();

export type Snapshot = z.infer<typeof snapshotSchema>;

export const usageAmountSchema = z
    .object({
        limit: z.number().optional(),
        remaining: z.number().optional(),
        remainingFraction: z.number().optional(),
        unit: z.string(),
        used: z.number().optional(),
        usedFraction: z.number().optional(),
    })
    .passthrough();

export type UsageAmount = z.infer<typeof usageAmountSchema>;

export const usageWindowSchema = z
    .object({
        label: z.string().optional(),
        resetLabel: z.string().optional(),
        resetsAt: z.number().optional(),
    })
    .passthrough();

export type UsageWindow = z.infer<typeof usageWindowSchema>;

export const usageLimitSchema = z
    .object({
        amount: usageAmountSchema,
        id: z.string(),
        label: z.string(),
        status: z.string().optional(),
        window: usageWindowSchema.optional(),
    })
    .passthrough();

export type UsageLimit = z.infer<typeof usageLimitSchema>;

export const usageReportSchema = z
    .object({
        fetchedAt: z.number(),
        limits: z.array(usageLimitSchema),
        metadata: z.record(z.string(), z.unknown()).optional(),
        provider: z.string(),
    })
    .passthrough();

export type UsageReport = z.infer<typeof usageReportSchema>;

export const clientProviderUsageSchema = z
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

export type ClientProviderUsage = z.infer<typeof clientProviderUsageSchema>;

export const clientUsageSchema = z
    .object({
        firstSeen: z.number(),
        hostname: z.string().optional(),
        installId: z.string(),
        lastSeen: z.number(),
        providers: z.array(clientProviderUsageSchema),
    })
    .passthrough();

export type ClientUsage = z.infer<typeof clientUsageSchema>;

export const usageSchema = z
    .object({
        clients: z.array(clientUsageSchema),
        generatedAt: z.number().optional(),
        reports: z.array(usageReportSchema),
    })
    .passthrough();

export type Usage = z.infer<typeof usageSchema>;

export const loginStateSchema = z.enum(["pending", "done", "error"]);

export type LoginState = z.infer<typeof loginStateSchema>;

export const loginSessionSchema = z
    .object({
        instructions: z.string().optional(),
        message: z.string().optional(),
        needsCode: z.boolean(),
        provider: providerSchema,
        sessionId: z.string(),
        state: loginStateSchema,
        url: z.string(),
    })
    .passthrough();

export type LoginSession = z.infer<typeof loginSessionSchema>;

export const loginStartResultSchema = z
    .object({
        instructions: z.string().optional(),
        needsCode: z.boolean(),
        sessionId: z.string(),
        url: z.string(),
    })
    .passthrough();

export type LoginStartResult = z.infer<typeof loginStartResultSchema>;

export const loginStatusResultSchema = z
    .object({
        message: z.string().optional(),
        needsCode: z.boolean(),
        state: loginStateSchema,
    })
    .passthrough();

export type LoginStatusResult = z.infer<typeof loginStatusResultSchema>;

export type AsyncState<T> = { phase: "loading" } | { phase: "ready"; data: T } | { phase: "error"; message: string };
