import { logger } from "@oh-my-pi/pi-utils";
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

function parseArgs(argv: string[]): Command | undefined {
    const [action, ...args] = argv;
    if (action === "serve") {
        return parseServeArgs(args);
    }
    if (action === "token") {
        return parseTokenArgs(args);
    }
    return undefined;
}

function parseServeArgs(args: string[]): ServeCommand | undefined {
    const [flag = "", value] = args;
    if (args.length === 0) {
        return { action: "serve", bind: undefined };
    }
    if (args.length === 1 && flag.startsWith("--bind=") && flag.length > "--bind=".length) {
        return { action: "serve", bind: flag.slice("--bind=".length) };
    }
    if (args.length === 2 && flag === "--bind" && value !== undefined && !value.startsWith("-")) {
        return { action: "serve", bind: value };
    }
    return undefined;
}

function parseTokenArgs(args: string[]): TokenCommand | undefined {
    const regenerate = args.includes("--regenerate");
    const json = args.includes("--json");
    if (args.length !== Number(regenerate) + Number(json)) {
        return undefined;
    }
    return { action: "token", regenerate, json };
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
