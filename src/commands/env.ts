import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import * as p from "@clack/prompts";
import { api } from "../api.ts";
import { exists, handleError, unwrap } from "../util.ts";

/** Writes a .env with a personal Supabase secret key (your previous one is revoked). */
export async function envPull(slug: string, opts: { dir?: string; force: boolean }) {
	const file = resolve(opts.dir ?? ".", ".env");
	if (exists(file) && !opts.force) {
		const ok = unwrap(await p.confirm({ message: `${file} ya existe. ¿Reemplazarlo?`, initialValue: false }));
		if (!ok) return;
	}
	try {
		const { env } = await api<{ env: string }>(`/api/cli/apps/${slug}/env`, { method: "POST" });
		await writeFile(file, env, { mode: 0o600 });
		p.log.success(`Escribí ${file}`);
	} catch (e) {
		handleError(e);
	}
}
