import * as p from "@clack/prompts";
import { api } from "../api.ts";
import { bold, cyan, dim, fail, green, handleError, red, sleep, unwrap, spinner } from "../util.ts";

/** Runs the deploy workflow (migrations → Cloud Run) and follows it. */
export async function deploy(slug: string) {
	const s = spinner();
	try {
		const { since } = await api<{ since: string }>(`/api/cli/apps/${slug}/deploy`, { method: "POST" });
		s.start("Esperando a que GitHub Actions arranque el deploy");
		type Status = {
			run: { url: string; status: string; conclusion: string | null } | null;
			jobs: { name: string; status: string; conclusion: string | null }[];
		};
		let shownUrl = false;
		while (true) {
			await sleep(5_000);
			const { run, jobs } = await api<Status>(`/api/cli/apps/${slug}/deploy?since=${encodeURIComponent(since)}`);
			if (!run) continue;
			if (!shownUrl) {
				s.stop(`Deploy en marcha: ${run.url}`);
				s.start("Desplegando");
				shownUrl = true;
			}
			const active = jobs.find((j) => j.status !== "completed");
			s.message(active ? `Corriendo: ${active.name}` : "Terminando");
			if (run.status === "completed") {
				if (run.conclusion === "success") s.stop(green("✓ Desplegado"));
				else {
					s.error(red(`El deploy terminó con: ${run.conclusion}`));
					fail("Revisa el log del workflow.", run.url);
				}
				return;
			}
		}
	} catch (e) {
		s.clear();
		handleError(e);
	}
}

export async function resetOwner(slug: string) {
	const ok = unwrap(
		await p.confirm({ message: `¿Generar una contraseña nueva para el owner de ${slug}? La actual deja de servir.`, initialValue: false })
	);
	if (!ok) return;
	try {
		const { email, password } = await api<{ email: string; password: string }>(
			`/api/cli/apps/${slug}/reset-owner`,
			{ method: "POST" }
		);
		p.note(
			`${bold("Correo:")}     ${email}\n${bold("Contraseña:")} ${cyan(password)}\n\n` +
				dim("Se muestra solo esta vez. La cambia en su próximo inicio de sesión."),
			"Owner"
		);
	} catch (e) {
		handleError(e);
	}
}

/** Moves an app created before per-app identities onto its own runtime and deployer. */
export async function isolate(slug: string) {
	const s = spinner();
	s.start(`Dándole identidades propias a ${slug} (puede tardar un par de minutos)`);
	try {
		const res = await api<{ runtime: string; deployer: string; secrets: string[] }>(
			`/api/cli/apps/${slug}/isolate`,
			{ method: "POST" }
		);
		s.stop(green(`✓ ${slug} aislada`));
		p.note(
			`${bold("Corre como:")}     ${res.runtime}\n${bold("Despliega con:")}  ${res.deployer}\n` +
				`${bold("Secretos:")}       ${res.secrets.length} (solo esta app los puede leer)\n\n` +
				dim("Solo el repo de esta app puede usar su deployer."),
			"Identidades"
		);
	} catch (e) {
		s.error("No se pudo aislar");
		handleError(e);
	}
}

export async function destroy(slug: string, opts: { yes: boolean }) {
	p.log.warn(
		`Esto elimina el servicio de Cloud Run, los secretos y el proyecto de Supabase ${bold("con toda su base de datos")}.\n` +
			"El repo se archiva (queda de solo lectura, no se borra)."
	);
	if (!opts.yes) {
		const typed = unwrap(await p.text({ message: `Escribe ${bold(slug)} para confirmar` }));
		if (typed !== slug) fail("No coincide; no se eliminó nada.");
	}
	const s = spinner();
	s.start(`Eliminando ${slug}`);
	try {
		await api(`/api/cli/apps/${slug}/destroy`, { method: "POST", body: { confirm: slug } });
		s.stop(green(`✓ ${slug} eliminada`));
	} catch (e) {
		s.error("No se pudo eliminar");
		handleError(e);
	}
}
