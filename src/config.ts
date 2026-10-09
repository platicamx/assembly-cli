import { chmod, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

/**
 * ~/.config/assembly/credentials.json, readable only by you (0600).
 * Holds the API URL and your CLI token — never any company credential.
 */
export type Credentials = { apiUrl: string; token: string; email: string; expiresAt: string };

export const DEFAULT_API_URL = "https://assembly.inc";

const dir = () => join(process.env.XDG_CONFIG_HOME ?? join(homedir(), ".config"), "assembly");
const file = () => join(dir(), "credentials.json");

/** ASSEMBLY_API_URL wins over the saved URL (useful against a local service). */
export function apiUrl(saved?: string) {
	return (process.env.ASSEMBLY_API_URL ?? saved ?? DEFAULT_API_URL).replace(/\/$/, "");
}

export async function loadCredentials(): Promise<Credentials | null> {
	try {
		return JSON.parse(await readFile(file(), "utf8")) as Credentials;
	} catch {
		return null;
	}
}

export async function saveCredentials(credentials: Credentials) {
	await mkdir(dir(), { recursive: true, mode: 0o700 });
	await writeFile(file(), JSON.stringify(credentials, null, 2), { mode: 0o600 });
	await chmod(file(), 0o600); // writeFile's mode only applies when the file is new
}

export async function clearCredentials() {
	await rm(file(), { force: true });
}
