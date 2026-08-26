import { logger } from "@oh-my-pi/pi-utils";
import { runServe } from "./serve";
import { runToken } from "./token";

const usage = `Usage:
  omp-auth-broker serve [--bind=<host:port>]
  omp-auth-broker token [--regenerate] [--json]`;

type Command =
  | { action: "serve"; bind?: string }
  | { action: "token"; regenerate: boolean; json: boolean };

function parseArgs(argv: string[]): Command | undefined {
  const [action, ...args] = argv;

  if (action === "serve") {
    let bind: string | undefined;

    for (let index = 0; index < args.length; index += 1) {
      const arg = args[index];
      if (arg.startsWith("--bind=")) {
        if (bind !== undefined || arg.length === "--bind=".length) {
          return undefined;
        }
        bind = arg.slice("--bind=".length);
        continue;
      }
      if (arg === "--bind") {
        const value = args[index + 1];
        if (bind !== undefined || value === undefined || value.startsWith("-")) {
          return undefined;
        }
        bind = value;
        index += 1;
        continue;
      }
      return undefined;
    }

    return { action, bind };
  }

  if (action === "token") {
    let regenerate = false;
    let json = false;

    for (const arg of args) {
      if (arg === "--regenerate" && !regenerate) {
        regenerate = true;
        continue;
      }
      if (arg === "--json" && !json) {
        json = true;
        continue;
      }
      return undefined;
    }

    return { action, regenerate, json };
  }

  return undefined;
}

async function main(): Promise<void> {
  const command = parseArgs(process.argv.slice(2));
  if (!command) {
    console.error(usage);
    process.exitCode = 1;
    return;
  }

  try {
    if (command.action === "serve") {
      await runServe({ bind: command.bind });
      return;
    }

    await runToken(command);
  } catch (error) {
    logger.error("omp-auth-broker failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    process.exitCode = 1;
  }
}

void main();
