import { logger } from "@oh-my-pi/pi-utils";
import { parseArgs as parseNodeArgs } from "node:util";
import { runServe } from "./serve";
import { runToken } from "./token";

const usage = `Usage:
  omp-auth-broker serve [--bind=<host:port>]
  omp-auth-broker token [--regenerate] [--json]`;

interface ServeCommand {
    action: "serve";
    bind?: string;
}

interface TokenCommand {
    action: "token";
    regenerate: boolean;
    json: boolean;
}
type Command = ServeCommand | TokenCommand;

const cliOptions = {
    bind: { type: "string" },
    regenerate: { type: "boolean" },
    json: { type: "boolean" },
} as const;

function parseArgs(argv: string[]): Command | undefined {
    const [action, ...args] = argv;
    try {
        const { values } = parseNodeArgs({ args, options: cliOptions, strict: true });
        if (action === "serve" && !values.regenerate && !values.json && values.bind !== "") {
            return { action, bind: values.bind };
        }
        if (action === "token" && values.bind === undefined) {
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
        await runServe({ bind: command.bind });
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
