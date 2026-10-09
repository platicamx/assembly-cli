import { mkdir, writeFile } from "node:fs/promises";
import { dirname, relative, resolve } from "node:path";
import { api } from "../api.ts";
import { dim, green, handleError, spinner } from "../util.ts";

const HEADER = `// Generated from the app's Supabase database by \`assembly types\`. Don't edit by hand:
// after a migration is deployed, run \`assembly types <app>\` again.

`;

/** Writes src/lib/types/database.ts from the real (deployed) schema. */
export async function types(slug: string, opts: { out?: string }) {
	const out = resolve(opts.out ?? "src/lib/types/database.ts");
	const s = spinner();
	s.start("Generando tipos desde la base de datos de la app");
	try {
		const { types } = await api<{ types: string }>(`/api/cli/apps/${slug}/types`);
		await mkdir(dirname(out), { recursive: true });
		await writeFile(out, HEADER + types);
		s.stop(`${green("✓")} Tipos en ${relative(process.cwd(), out) || out}`);
		console.log(dim("Refleja lo que ya está desplegado. Para una migración nueva, haz push y vuelve a correrlo."));
	} catch (e) {
		s.error("No se pudieron generar los tipos");
		handleError(e);
	}
}
