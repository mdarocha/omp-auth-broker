import type { Browser, BrowserContext, Page } from "@playwright/test";
import { expect, test } from "bun:test";
import { chromium } from "@playwright/test";
import { LOOPBACK_HOSTNAMES } from "./loopback";
import { startTestApp } from "./fixture";
import type { TestApp } from "./fixture";

const INITIAL_RENDER_TIMEOUT_MS = 60_000;

test("connects and removes a mock provider through the browser UI", async () => {
    const chromiumPath = process.env.CHROME_BIN;
    if (!chromiumPath) {
        throw new Error("CHROME_BIN is required for UI E2E tests. Enter the Nix development shell.");
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
        context = await browser.newContext();
        await context.route("**/*", async (route) => {
            const hostname = new URL(route.request().url()).hostname;
            await (Object.hasOwn(LOOPBACK_HOSTNAMES, hostname) ? route.continue() : route.abort());
        });
        page = await context.newPage();

        await page.goto(app.baseUrl, { waitUntil: "domcontentloaded" });
        expect(await page.title()).toBe("omp auth broker");

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
            { timeout: INITIAL_RENDER_TIMEOUT_MS },
        );
        expect(await addProvider.getAttribute("aria-expanded")).toBe("false");

        await addProvider.click();
        expect(await addProvider.getAttribute("aria-expanded")).toBe("true");
        const mockProvider = page.getByRole("button", { name: "Mock Provider" });
        await mockProvider.waitFor({ state: "visible", timeout: INITIAL_RENDER_TIMEOUT_MS }).catch((error: unknown) => {
            throw new Error("Mock Provider entry never appeared in the Add provider list", { cause: error });
        });
        await mockProvider.click();

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
        await success.waitFor({ state: "visible", timeout: 30_000 }).catch((error: unknown) => {
            throw new Error("OAuth success message never appeared after opening the mock authorization flow", {
                cause: error,
            });
        });
        expect(await success.textContent()).toBe("Mock Provider is connected. The vault has been refreshed.");

        const accountRow = page.getByRole("row", { name: /mock-provider/i });
        await accountRow.waitFor({ state: "visible", timeout: 30_000 }).catch((error: unknown) => {
            throw new Error("mock-provider row never appeared in the Accounts table after connecting", {
                cause: error,
            });
        });
        const accountsTable = page.getByRole("table");
        await accountsTable.waitFor({ state: "visible", timeout: INITIAL_RENDER_TIMEOUT_MS });
        await accountsTable
            .getByRole("columnheader", { name: "Provider" })
            .waitFor({ state: "visible", timeout: INITIAL_RENDER_TIMEOUT_MS });

        page.once("dialog", (dialog) => void dialog.accept());
        await accountRow.getByRole("button", { name: "Remove" }).click();
        await accountRow.waitFor({ state: "detached", timeout: 30_000 }).catch((error: unknown) => {
            throw new Error("mock-provider row was not removed from the Accounts table after confirming removal", {
                cause: error,
            });
        });
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
