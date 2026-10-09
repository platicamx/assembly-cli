import { mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { styleText } from "node:util";
import { VERSION } from "./version.ts";

/**
 * Tells you when a newer CLI is on npm — checked at most once a day, in the
 * background, never blocking or failing a command.
 */
const CACHE = join(process.env.XDG_CONFIG_HOME ?? join(homedir(), ".config"), "assembly", "update-check.json");
const DAY = 24 * 60 * 60_000;

const newer = (a: string, b: string) => {
	const [x, y] = [a, b].map((v) => v.split(".").map(Number));
	for (let i = 0; i < 3; i++) if ((x[i] ?? 0) !== (y[i] ?? 0)) return (x[i] ?? 0) > (y[i] ?? 0);
	return false;
};

export async function checkForUpdate(): Promise<string | null> {
	if (process.env.CI || process.env.ASSEMBLY_NO_UPDATE_CHECK) return null;
	let cache: { at: number; latest: string } | null = null;
	try {
		cache = JSON.parse(await readFile(CACHE, "utf8"));
	} catch {}

	if (!cache || Date.now() - cache.at > DAY) {
		try {
			const res = await fetch("https://registry.npmjs.org/@platicamx/assembly-cli/latest", {
				signal: AbortSignal.timeout(1500),
			});
			if (res.ok) {
				cache = { at: Date.now(), latest: ((await res.json()) as { version: string }).version };
				await mkdir(join(CACHE, ".."), { recursive: true });
				await writeFile(CACHE, JSON.stringify(cache));
			}
		} catch {}
	}

	if (!cache || !newer(cache.latest, VERSION)) return null;
	return (
		`${styleText("yellow", "Hay una versión nueva:")} ${VERSION} → ${styleText("green", cache.latest)}\n` +
		styleText("dim", "npm i -g @platicamx/assembly-cli@latest")
	);
}
