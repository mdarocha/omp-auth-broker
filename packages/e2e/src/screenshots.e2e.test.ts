import type { Browser, BrowserContext, Locator, Page } from "@playwright/test";
import { expect, test } from "bun:test";
import { chromium } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { startTestApp } from "./fixture";
import type { TestApp } from "./fixture";
import type { UsageReport } from "@oh-my-pi/pi-ai";

const INITIAL_RENDER_TIMEOUT_MS = 60_000;
const LOGIN_TIMEOUT_MS = 30_000;
const MOCK_ACCOUNT_COUNT = 2;
const LIMITS_PER_MOCK_ACCOUNT = 2;

const LOOPBACK_HOSTNAMES: Record<string, true> = {
    "127.0.0.1": true,
    "::1": true,
    localhost: true,
};

const SCREENSHOTS_DIR = resolve(import.meta.dir, "../../../docs/screenshots");

interface SeedClientUsageEntry {
    at: number;
    provider: string;
    model: string;
    requests: number;
    inputTokens: number;
    outputTokens: number;
    cacheReadTokens: number;
    cacheWriteTokens: number;
    costUsd: number;
}

interface SeedClientUsageReport {
    installId: string;
    hostname: string;
    entries: SeedClientUsageEntry[];
}

function buildSeedClientUsageReports(): SeedClientUsageReport[] {
    const now = Date.now();
    return [
        {
            installId: "a1b2c3d4-workstation",
            hostname: "workstation",
            entries: [
                {
                    at: now - 2 * 60 * 60 * 1000,
                    provider: "mock-provider",
                    model: "mock-large",
                    requests: 128,
                    inputTokens: 482_000,
                    outputTokens: 96_400,
                    cacheReadTokens: 210_000,
                    cacheWriteTokens: 18_500,
                    costUsd: 6.42,
                },
            ],
        },
        {
            installId: "e5f6a7b8-ci-runner",
            hostname: "ci-runner-01",
            entries: [
                {
                    at: now - 26 * 60 * 60 * 1000,
                    provider: "mock-provider",
                    model: "mock-small",
                    requests: 954,
                    inputTokens: 1_240_000,
                    outputTokens: 310_000,
                    cacheReadTokens: 640_000,
                    cacheWriteTokens: 42_000,
                    costUsd: 14.87,
                },
            ],
        },
    ];
}

// `mock-provider` has no real quota endpoint; it only implements login (see mock-provider.ts).
// `AuthStorage.fetchUsageReports` can be overridden entirely, so this seeds two mock accounts' limits directly.
function buildSeedUsageReports(): UsageReport[] {
    const now = Date.now();
    return [
        {
            provider: "mock-provider",
            fetchedAt: now,
            metadata: { email: "mock-user@localhost" },
            limits: [
                {
                    id: "mock-5h-1",
                    label: "5 Hour Limit",
                    scope: { provider: "mock-provider", modelId: "mock-large", windowId: "5h" },
                    window: { id: "5h", label: "5 Hour", resetsAt: now + 45 * 60 * 1000 },
                    amount: { used: 62, limit: 100, unit: "percent" },
                    status: "warning",
                },
                {
                    id: "mock-7d-1",
                    label: "Weekly Tokens",
                    scope: { provider: "mock-provider", modelId: "mock-large", windowId: "7d" },
                    window: { id: "7d", label: "7 Day", resetsAt: now + 4 * 24 * 60 * 60 * 1000 },
                    amount: { used: 1_200_000, limit: 5_000_000, unit: "tokens" },
                    status: "ok",
                },
            ],
        },
        {
            provider: "mock-provider",
            fetchedAt: now,
            metadata: { email: "mock-user-2@localhost" },
            limits: [
                {
                    id: "mock-5h-2",
                    label: "5 Hour Limit",
                    scope: { provider: "mock-provider", modelId: "mock-small", windowId: "5h" },
                    window: { id: "5h", label: "5 Hour", resetsAt: now + 45 * 60 * 1000 },
                    amount: { used: 97, limit: 100, unit: "percent" },
                    status: "exhausted",
                },
                {
                    id: "mock-7d-2",
                    label: "Weekly Tokens",
                    scope: { provider: "mock-provider", modelId: "mock-small", windowId: "7d" },
                    window: { id: "7d", label: "7 Day", resetsAt: now + 2 * 24 * 60 * 60 * 1000 },
                    amount: { used: 3_400_000, limit: 4_000_000, unit: "tokens" },
                    status: "warning",
                },
            ],
        },
    ];
}

// Seeds two synthetic clients via the generic `/v1/usage/observed` endpoint so "Client activity" has data.
async function seedClientUsage(baseUrl: string): Promise<void> {
    for (const report of buildSeedClientUsageReports()) {
        const response = await fetch(new URL("/v1/usage/observed", baseUrl), {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(report),
        });
        if (!response.ok) {
            throw new Error(`Seeding client usage failed with status ${response.status}: ${await response.text()}`);
        }
    }
}

// Accounts and Usage render live, time-dependent text such as absolute timestamps and short relative subtitles.
// This pins that text to fixed placeholders right before each capture so screenshot bytes stay stable across runs.
// That keeps CI's byte-diff commit gate quiet when the UI itself has not changed.
function normalizeVolatileTimestamps(): void {
    const FIXED_ABSOLUTE = "Jan 5, 2026, 9:00 AM";
    const FIXED_RELATIVE = "in 45 mins";

    const setAbsoluteRelative = (cell: Element | null | undefined) => {
        if (!cell) {
            return;
        }
        const span = cell.querySelector("span");
        const small = cell.querySelector("small");
        if (span) {
            span.textContent = FIXED_ABSOLUTE;
        }
        if (small) {
            small.textContent = FIXED_RELATIVE;
        }
    };

    document.querySelectorAll("p.updated").forEach((element) => {
        element.textContent = "Updated moments ago";
    });

    document.querySelectorAll('section[aria-labelledby="accounts-heading"] table tbody tr').forEach((row) => {
        const cells = row.querySelectorAll("td.numeric");
        setAbsoluteRelative(cells[0]); // Expires
        const refreshCell = cells[1]; // Refresh in
        if (refreshCell && refreshCell.textContent !== "—") {
            refreshCell.textContent = FIXED_RELATIVE;
        }
    });

    const usageBlocks = document.querySelectorAll('section[aria-labelledby="usage-heading"] .usage-block');
    usageBlocks[0]?.querySelectorAll("table tbody tr").forEach((row) => {
        setAbsoluteRelative(row.querySelector("td.numeric:not(.usage-amount)")); // Reset
    });
    usageBlocks[1]?.querySelectorAll("table tbody tr").forEach((row) => {
        const cells = row.querySelectorAll("td.numeric");
        setAbsoluteRelative(cells[cells.length - 1]); // Last seen
    });
}

async function openProviderPicker(page: Page, addProviderButton: Locator): Promise<Locator> {
    await addProviderButton.click();
    const mockProviderButton = page.getByRole("button", { name: "Mock Provider" });
    await mockProviderButton
        .waitFor({ state: "visible", timeout: INITIAL_RENDER_TIMEOUT_MS })
        .catch((error: unknown) => {
            throw new Error("Mock Provider entry never appeared in the Add provider list", { cause: error });
        });
    return mockProviderButton;
}

async function completeMockLogin(page: Page, mockProviderButton: Locator, app: TestApp): Promise<void> {
    await mockProviderButton.click();

    const authorizationLink = page.getByRole("link", { name: "Open authorization" });
    await authorizationLink
        .waitFor({ state: "visible", timeout: INITIAL_RENDER_TIMEOUT_MS })
        .catch((error: unknown) => {
            throw new Error("Authorization link never appeared after selecting Mock Provider", { cause: error });
        });
    const authorizationHref = await authorizationLink.getAttribute("href");
    expect(authorizationHref).not.toBeNull();
    const authorizationUrl = new URL(authorizationHref!);
    expect(authorizationUrl.origin).toBe(new URL(app.mockProvider.url).origin);
    expect(authorizationUrl.pathname).toBe("/authorize");

    const success = page.locator("output", {
        hasText: "Mock Provider is connected. The vault has been refreshed.",
    });
    await success.waitFor({ state: "visible", timeout: LOGIN_TIMEOUT_MS }).catch((error: unknown) => {
        throw new Error("OAuth success message never appeared after opening the mock authorization flow", {
            cause: error,
        });
    });
}

test("refreshes README screenshots from the live UI", async () => {
    const chromiumPath = process.env.CHROME_BIN;
    if (!chromiumPath) {
        throw new Error("CHROME_BIN is required for screenshot E2E tests. Enter the Nix development shell.");
    }
    if (!(await Bun.file(chromiumPath).exists())) {
        throw new Error("CHROME_BIN does not point to a Chromium binary. Enter the Nix development shell.");
    }

    let app: TestApp | undefined;
    let browser: Browser | undefined;
    let context: BrowserContext | undefined;
    let page: Page | undefined;

    try {
        app = await startTestApp({
            authStorageOptions: { fetchUsageReports: async () => buildSeedUsageReports() },
        });
        await seedClientUsage(app.baseUrl);

        browser = await chromium.launch({ executablePath: chromiumPath, headless: true });
        context = await browser.newContext({ deviceScaleFactor: 2, viewport: { height: 1300, width: 1440 } });
        await context.route("**/*", async (route) => {
            const hostname = new URL(route.request().url()).hostname;
            await (Object.hasOwn(LOOPBACK_HOSTNAMES, hostname) ? route.continue() : route.abort());
        });
        const screenshotPage = await context.newPage();
        page = screenshotPage;

        await page.goto(app.baseUrl, { waitUntil: "domcontentloaded" });
        expect(await page.title()).toBe("omp auth broker");

        const usageHeading = page.getByRole("heading", { name: "Usage" });
        const usageSection = page.locator('section.section[aria-labelledby="usage-heading"]');
        const addProvider = page.locator('button[aria-controls="provider-picker"]');
        await page.waitForFunction(
            () => {
                const heading = document.querySelector("#accounts-heading");
                if (!heading) {
                    return false;
                }
                const style = getComputedStyle(heading);
                const rect = heading.getBoundingClientRect();
                return rect.width > 0 && rect.height > 0 && style.visibility !== "hidden" && style.display !== "none";
            },
            undefined,
            { timeout: INITIAL_RENDER_TIMEOUT_MS },
        );
        await Promise.all([
            page
                .getByRole("region", { name: "Accounts" })
                .waitFor({ state: "visible", timeout: INITIAL_RENDER_TIMEOUT_MS }),
            usageHeading.waitFor({ state: "visible", timeout: INITIAL_RENDER_TIMEOUT_MS }),
            usageSection.waitFor({ state: "visible", timeout: INITIAL_RENDER_TIMEOUT_MS }),
            addProvider.waitFor({ state: "visible", timeout: INITIAL_RENDER_TIMEOUT_MS }),
        ]);

        // First screenshot: state right after "Add provider" is clicked, showing every registered provider.
        let mockProviderButton = await openProviderPicker(page, addProvider);
        await mkdir(SCREENSHOTS_DIR, { recursive: true });
        await page.evaluate(normalizeVolatileTimestamps);
        await page.screenshot({ path: resolve(SCREENSHOTS_DIR, "add-provider.png"), fullPage: true });

        // Connect a couple of mock accounts so the second screenshot shows a filled-out app, not an empty vault.
        for (let account = 1; account <= MOCK_ACCOUNT_COUNT; account += 1) {
            if (account > 1) {
                mockProviderButton = await openProviderPicker(page, addProvider);
            }
            await completeMockLogin(page, mockProviderButton, app);
        }

        await page.waitForFunction(
            (expected) =>
                document.querySelectorAll('section[aria-labelledby="accounts-heading"] table tbody tr').length ===
                expected,
            MOCK_ACCOUNT_COUNT,
            { timeout: LOGIN_TIMEOUT_MS },
        );

        const accountsTable = page.getByRole("table").first();
        await accountsTable
            .getByRole("columnheader", { name: "Provider" })
            .waitFor({ state: "visible", timeout: 15_000 });

        const credentialLimits = usageSection.locator(".usage-block").nth(0);
        const clientActivity = usageSection.locator(".usage-block").nth(1);
        await Promise.all([
            credentialLimits.locator(".table-frame").locator("table, .empty-state").waitFor({
                state: "visible",
                timeout: 30_000,
            }),
            clientActivity.locator(".table-frame").locator("table, .empty-state").waitFor({
                state: "visible",
                timeout: 30_000,
            }),
        ]);
        await page.waitForFunction(
            (expected) => {
                const blocks = document.querySelectorAll('section[aria-labelledby="usage-heading"] .usage-block');
                return blocks[0]?.querySelectorAll("table tbody tr").length === expected;
            },
            MOCK_ACCOUNT_COUNT * LIMITS_PER_MOCK_ACCOUNT,
            { timeout: 30_000 },
        );
        await page.waitForFunction(
            (expected) => {
                const blocks = document.querySelectorAll('section[aria-labelledby="usage-heading"] .usage-block');
                return blocks[1]?.querySelectorAll("table tbody tr").length === expected;
            },
            buildSeedClientUsageReports().length,
            { timeout: 30_000 },
        );

        // Dismiss the last login's success banner so the overview screenshot shows steady state, not a toast.
        await page.getByRole("button", { name: "Dismiss authorization panel" }).click();

        await usageHeading.scrollIntoViewIfNeeded();
        await page.evaluate(normalizeVolatileTimestamps);
        await page.screenshot({ path: resolve(SCREENSHOTS_DIR, "overview.png"), fullPage: true });
    } finally {
        try {
            await page?.close();
        } finally {
            try {
                await context?.close();
            } finally {
                try {
                    await browser?.close();
                } finally {
                    await app?.close();
                }
            }
        }
    }
}, 175_000);
