import { randomBytes } from "node:crypto";
import { chmod, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { getConfigRootDir } from "@oh-my-pi/pi-utils";

export interface TokenFlags {
  regenerate: boolean;
  json: boolean;
}

export function getTokenFilePath(): string {
  return join(getConfigRootDir(), "auth-broker.token");
}

export async function readToken(): Promise<string | undefined> {
  try {
    const token = (await readFile(getTokenFilePath(), "utf8")).trim();
    return token || undefined;
  } catch (error) {
    if (isEnoent(error)) {
      return undefined;
    }
    throw error;
  }
}

export async function writeToken(token: string): Promise<void> {
  const tokenPath = getTokenFilePath();
  await mkdir(dirname(tokenPath), { recursive: true });
  await writeFile(tokenPath, `${token}\n`, { mode: 0o600 });
  await chmod(tokenPath, 0o600);
}

export function generateToken(): string {
  return randomBytes(32).toString("hex");
}

export async function ensureToken(regenerate = false): Promise<string> {
  if (!regenerate) {
    const existing = await readToken();
    if (existing) {
      return existing;
    }
  }

  const token = generateToken();
  await writeToken(token);
  return token;
}

export async function runToken(flags: TokenFlags): Promise<void> {
  const token = await ensureToken(flags.regenerate);
  process.stdout.write(flags.json ? `${JSON.stringify({ token })}\n` : `${token}\n`);
}

function isEnoent(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "ENOENT"
  );
}
