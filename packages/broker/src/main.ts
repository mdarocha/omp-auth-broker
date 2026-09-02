import { initLogging } from "./logging";
import { logger } from "@oh-my-pi/pi-utils";
import { parseArgs as parseNodeArgs } from "node:util";
import { runServe } from "./serve";
import { runToken } from "./token";

const usage = `Usage:
  omp-auth-broker serve [--settings=<path>]
  omp-auth-broker token [--regenerate] [--json]`;

interface ServeCommand {
    action: "serve";
    settings?: string;
}

interface TokenCommand {
    action: "token";
    regenerate: boolean;
    json: boolean;
}
type Command = ServeCommand | TokenCommand;

const cliOptions = {
    settings: { type: "string" },
    regenerate: { type: "boolean" },
    json: { type: "boolean" },
} as const;

function parseArgs(argv: string[]): Command | undefined {
    const [action, ...args] = argv;
    try {
        const { values } = parseNodeArgs({ args, options: cliOptions, strict: true });
        if (action === "serve" && !values.regenerate && !values.json && values.settings !== "") {
            return { action, settings: values.settings };
        }
        if (action === "token" && values.settings === undefined) {
            return {
                action,
                regenerate: values.regenerate ?? false,
                json: values.json ?? false,
            };
        }
    } catch {
        return undefined;
    }
    return undefined;
}

async function main(): Promise<void> {
    initLogging();
    const command = parseArgs(process.argv.slice(2));
    if (!command) {
        showUsage();
        return;
    }

    try {
        await dispatchCommand(command);
    } catch (error) {
        reportFailure(error);
    }
}

async function dispatchCommand(command: Command): Promise<void> {
    if (command.action === "serve") {
        await runServe({ settings: command.settings });
        return;
    }
    await runToken(command);
}

function showUsage(): void {
    console.error(usage);
    process.exitCode = 1;
}

function reportFailure(error: unknown): void {
    logger.error("omp-auth-broker failed", {
        error: error instanceof Error ? error.message : String(error),
    });
    process.exitCode = 1;
}

void main();
