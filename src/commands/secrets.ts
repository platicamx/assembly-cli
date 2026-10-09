import * as p from "@clack/prompts";
import { api } from "../api.ts";
import { bold, cyan, dim, fail, green, handleError, unwrap, spinner } from "../util.ts";

const NAME = /^[A-Z][A-Z0-9_]{1,62}$/;

/** Value from a hidden prompt (keeps it out of shell history) or from stdin when piped. */
async function readValue(name: string) {
	if (!process.stdin.isTTY) {
		const chunks: Buffer[] = [];
		for await (const chunk of process.stdin) chunks.push(chunk as Buffer);
		return Buffer.concat(chunks).toString("utf8").replace(/\r?\n$/, "");
	}
	return unwrap(
		await p.password({
			message: `Valor de ${bold(name)}`,
			validate: (v) => (v ? undefined : "Escribe un valor"),
		})
	);
}

export async function secretsSet(slug: string, name: string, inline?: string) {
	if (!NAME.test(name)) fail("Nombre inválido.", "Usa MAYÚSCULAS, números y _ (p. ej. OPENAI_API_KEY)");
	if (inline) p.log.warn(dim("Pasar el valor en el comando lo deja en el historial de tu terminal. Mejor omítelo y te lo pido."));
	const value = inline ?? (await readValue(name));
	if (!value) fail("El valor está vacío.");

	const s = spinner();
	s.start(`Guardando ${name} en ${slug}`);
	try {
		await api(`/api/cli/apps/${slug}/secrets`, { method: "POST", body: { name, value } });
		s.stop(`${green("✓")} ${bold(name)} guardada`);
		p.log.message(
			dim(
				"La app se reinicia con el valor nuevo en ~30 s (process.env / $env/dynamic/private).\n" +
					`Para tenerla en local: assembly env pull ${slug}`
			)
		);
	} catch (e) {
		s.error("No se pudo guardar");
		handleError(e);
	}
}

export async function secretsList(slug: string) {
	try {
		const { names } = await api<{ names: string[] }>(`/api/cli/apps/${slug}/secrets`);
		if (!names.length) {
			p.log.info(`${slug} no tiene llaves todavía. Agrega una con: ${cyan(`assembly secrets set ${slug} NOMBRE`)}`);
			return;
		}
		p.note(names.map((n) => `• ${n}`).join("\n"), `Llaves de ${slug}`);
		p.log.message(dim("Los valores nunca se muestran. Para usarlos en local: assembly env pull " + slug));
	} catch (e) {
		handleError(e);
	}
}

export async function secretsUnset(slug: string, name: string, opts: { yes: boolean }) {
	if (!opts.yes) {
		const ok = unwrap(
			await p.confirm({ message: `¿Eliminar ${bold(name)} de ${slug}? El código que la use dejará de funcionar.`, initialValue: false })
		);
		if (!ok) return;
	}
	const s = spinner();
	s.start(`Eliminando ${name}`);
	try {
		await api(`/api/cli/apps/${slug}/secrets/${name}`, { method: "DELETE" });
		s.stop(`${green("✓")} ${name} eliminada`);
	} catch (e) {
		s.error("No se pudo eliminar");
		handleError(e);
	}
}
