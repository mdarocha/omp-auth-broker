import type { Browser, BrowserContext, Locator, Page } from "@playwright/test";
import { expect, test } from "bun:test";
import { chromium } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { startTestApp } from "./fixture";
import type { TestApp } from "./fixture";

const LOOPBACK_HOSTNAMES: Record<string, true> = {
    "127.0.0.1": true,
    "::1": true,
    localhost: true,
};

const SCREENSHOTS_DIR = resolve(import.meta.dir, "../../../docs/screenshots");

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
        app = await startTestApp();
        browser = await chromium.launch({ executablePath: chromiumPath, headless: true });
        context = await browser.newContext({ deviceScaleFactor: 2, viewport: { height: 1300, width: 1440 } });
        await context.route("**/*", async (route) => {
            const hostname = new URL(route.request().url()).hostname;
            await (Object.hasOwn(LOOPBACK_HOSTNAMES, hostname) ? route.continue() : route.abort());
        });
        const screenshotPage = await context.newPage();
        page = screenshotPage;

        const captureSection = async (section: Locator, filename: string) => {
            const bounds = await section.boundingBox();
            const viewport = screenshotPage.viewportSize();
            if (!bounds || !viewport) {
                throw new Error(`Could not determine the screenshot frame for ${filename}`);
            }

            await screenshotPage.screenshot({
                path: resolve(SCREENSHOTS_DIR, filename),
                clip: { x: 0, y: bounds.y, width: viewport.width, height: bounds.height },
            });
        };

        const captureUsageSection = async (section: Locator, clientActivity: Locator) => {
            const [sectionBounds, clientActivityBounds] = await Promise.all([
                section.boundingBox(),
                clientActivity.boundingBox(),
            ]);
            const viewport = screenshotPage.viewportSize();
            const bottomPadding = await section.evaluate((element) =>
                Number.parseFloat(getComputedStyle(element).paddingBottom),
            );
            if (!sectionBounds || !clientActivityBounds || !viewport || !Number.isFinite(bottomPadding)) {
                throw new Error("Could not determine the screenshot frame for usage.png");
            }

            await screenshotPage.screenshot({
                path: resolve(SCREENSHOTS_DIR, "usage.png"),
                clip: {
                    x: 0,
                    y: sectionBounds.y,
                    width: viewport.width,
                    height: clientActivityBounds.y + clientActivityBounds.height - sectionBounds.y + bottomPadding,
                },
            });
        };

        await page.goto(app.baseUrl, { waitUntil: "domcontentloaded" });
        expect(await page.title()).toBe("omp auth broker");

        const accountsHeading = page.getByRole("heading", { name: "Accounts" });
        const accountsSection = page.getByRole("region", { name: "Accounts" });
        const usageHeading = page.getByRole("heading", { name: "Usage" });
        const usageSection = page.locator('section.section[aria-labelledby="usage-heading"]');
        const addProvider = page.locator('button[aria-controls="provider-picker"]');
        await Promise.all([
            accountsHeading.waitFor({ state: "visible", timeout: 15_000 }),
            accountsSection.waitFor({ state: "visible", timeout: 15_000 }),
            usageHeading.waitFor({ state: "visible", timeout: 15_000 }),
            usageSection.waitFor({ state: "visible", timeout: 15_000 }),
            addProvider.waitFor({ state: "visible", timeout: 15_000 }),
        ]);

        await addProvider.click();
        const mockProvider = page.getByRole("button", { name: "Mock Provider" });
        await mockProvider.waitFor({ state: "visible", timeout: 15_000 }).catch((error: unknown) => {
            throw new Error("Mock Provider entry never appeared in the Add provider list", { cause: error });
        });
        await mockProvider.click();

        const authorizationLink = page.getByRole("link", { name: "Open authorization" });
        await authorizationLink.waitFor({ state: "visible", timeout: 15_000 }).catch((error: unknown) => {
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
        await success.waitFor({ state: "visible", timeout: 30_000 }).catch((error: unknown) => {
            throw new Error("OAuth success message never appeared after opening the mock authorization flow", {
                cause: error,
            });
        });

        const accountRow = page.getByRole("row", { name: /mock-provider/i });
        const accountsTable = page.getByRole("table");
        await Promise.all([
            accountRow.waitFor({ state: "visible", timeout: 30_000 }),
            accountsTable.waitFor({ state: "visible", timeout: 15_000 }),
            accountsTable
                .getByRole("columnheader", { name: "Provider" })
                .waitFor({ state: "visible", timeout: 15_000 }),
        ]);

        await mkdir(SCREENSHOTS_DIR, { recursive: true });
        await captureSection(accountsSection, "accounts.png");

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
        await usageHeading.scrollIntoViewIfNeeded();
        await captureUsageSection(usageSection, clientActivity);
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
