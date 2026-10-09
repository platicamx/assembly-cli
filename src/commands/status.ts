import * as p from "@clack/prompts";
import { api, type App } from "../api.ts";
import { bold, dim, green, handleError, red } from "../util.ts";

export function printApp(app: App) {
	const lines = [
		`${bold("App:")}       ${app.url}`,
		`${bold("Repo:")}      ${app.repoUrl ?? "—"}`,
		`${bold("Supabase:")}  ${app.supabaseDashboard ?? "—"}`,
		`${bold("Empresa:")}   ${app.company}  ${dim(`· owner ${app.ownerEmail}`)}`,
		`${bold("Correo:")}    ${app.emailFrom ?? dim(`sin configurar · assembly email ${app.slug}`)}`,
		dim(`Creada por ${app.createdBy} el ${app.createdAt.slice(0, 10)}`),
	];
	if (app.deployRunUrl) lines.splice(3, 0, `${bold("Deploy:")}    ${app.deployRunUrl}`);
	p.note(lines.join("\n"), app.slug);
}

export async function status(slug: string) {
	try {
		const app = await api<App>(`/api/cli/apps/${slug}`);
		if (app.status !== "ready") {
			for (const step of app.steps) {
				const mark = step.status === "done" ? green("✓") : step.status === "failed" ? red("✗") : dim("○");
				p.log.message(`${mark} ${step.label}${step.error ? red(` — ${step.error}`) : ""}`);
			}
			p.log.info(`Sin terminar. Para retomarla: assembly create ${slug}`);
		}
		printApp(app);
	} catch (e) {
		handleError(e);
	}
}

export async function list() {
	try {
		const apps = await api<App[]>("/api/cli/apps");
		if (!apps.length) return p.log.info("Todavía no hay apps. Crea una con: assembly create <nombre>");
		for (const app of apps) {
			const state = app.status === "ready" ? green("lista") : dim("creándose");
			p.log.message(`${bold(app.slug)}  ${state}  ${dim(app.url)}  ${dim(app.createdBy)}`);
		}
	} catch (e) {
		handleError(e);
	}
}
