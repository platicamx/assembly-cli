import { writeFile } from "node:fs/promises";
import { relative, resolve } from "node:path";
import * as p from "@clack/prompts";
import { api, ApiError, type App } from "../api.ts";
import { banner } from "../banner.ts";
import { loadCredentials } from "../config.ts";
import { bold, cyan, dim, exists, fail, green, handleError, hasCommand, red, run, sleep, unwrap, spinner } from "../util.ts";
import { printApp } from "./status.ts";

export type CreateOptions = {
	owner?: string;
	company?: string;
	color?: string;
	firstName?: string;
	lastName?: string;
	dir?: string;
	clone: boolean;
	yes: boolean;
};

const SLUG = /^[a-z](?:[a-z0-9]|-(?=[a-z0-9])){2,29}$/;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const HEX = /^#[0-9a-fA-F]{6}$/;

const COLORS = [
	{ value: "#2f6fe0", label: "Azul" },
	{ value: "#4a9b9b", label: "Teal" },
	{ value: "#7c3aed", label: "Morado" },
	{ value: "#16a34a", label: "Verde" },
	{ value: "#ea580c", label: "Naranja" },
	{ value: "#0f172a", label: "Grafito" },
];

const slugError = (v = "") =>
	SLUG.test(v) ? undefined : "3–30 caracteres: minúsculas, números y guiones; empieza con letra";

/** "Acme Corp" → "acme-corp" as the suggested app name. */
const slugify = (s: string) =>
	s
		.normalize("NFD")
		.replace(/[̀-ͯ]/g, "")
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "")
		.slice(0, 30);

export async function create(slugArg: string | undefined, opts: CreateOptions) {
	console.log(banner("Nueva app"));
	p.intro(bold(" assembly create "));

	const credentials = await loadCredentials();
	if (!credentials) fail("Primero inicia sesión.", "Corre: assembly login");
	const interactive = !!process.stdin.isTTY;

	if (slugArg && slugError(slugArg)) fail(`Nombre inválido: ${slugError(slugArg)}.`);
	if (opts.color && !HEX.test(opts.color)) fail("El color debe ser hexadecimal, por ejemplo #2f6fe0.");

	// 1. An unfinished app you started is resumed with the inputs it was created with
	let app: App | null = null;
	if (slugArg) {
		const existing = await api<App>(`/api/cli/apps/${slugArg}`).catch((e) => {
			if (e instanceof ApiError && e.status === 404) return null;
			handleError(e);
		});
		if (existing?.status === "provisioning") {
			p.log.info(`Retomando ${bold(slugArg)} donde se quedó.`);
			app = existing;
		} else if (existing) {
			fail(`Ya existe una app llamada ${slugArg}.`, `Ver: assembly status ${slugArg}`);
		}
	}

	const slug = app?.slug ?? slugArg;
	let dir = resolve(opts.dir ?? slug ?? ".");

	if (!app) {
		// 2. Ask for whatever wasn't passed as a flag
		if (!interactive && (!slugArg || !opts.owner)) fail("Faltan datos.", "Uso: assembly create <nombre> --owner <correo>");

		const company =
			opts.company ??
			(interactive
				? unwrap(
						await p.text({
							message: "¿Cómo se llama la empresa?",
							placeholder: "Acme S.A. de C.V.",
							validate: (v) => (v?.trim() ? undefined : "Escribe un nombre"),
						})
					).trim()
				: slugArg!);

		const name =
			slugArg ??
			unwrap(
				await p.text({
					message: "Nombre de la app",
					placeholder: slugify(company) || "mi-app",
					initialValue: slugify(company),
					validate: slugError,
				})
			);

		const owner =
			opts.owner ??
			unwrap(
				await p.text({
					message: "Correo del owner",
					placeholder: "ana@empresa.com",
					validate: (v) => (EMAIL.test(v ?? "") ? undefined : "Correo inválido"),
				})
			);

		const firstName =
			opts.firstName ??
			(interactive && !opts.owner
				? unwrap(await p.text({ message: "Nombre del owner", placeholder: "Opcional" })).trim() || undefined
				: undefined);

		let color = opts.color;
		if (!color && interactive && !opts.yes) {
			const picked = unwrap(
				await p.select({
					message: "Color de la marca",
					options: [
						...COLORS.map((c) => ({ value: c.value, label: c.label, hint: c.value })),
						{ value: "custom", label: "Otro…" },
					],
				})
			);
			color =
				picked === "custom"
					? unwrap(
							await p.text({
								message: "Color en hexadecimal",
								placeholder: "#2f6fe0",
								validate: (v) => (HEX.test(v ?? "") ? undefined : "Formato #RRGGBB"),
							})
						)
					: picked;
		}

		dir = resolve(opts.dir ?? name);
		if (opts.clone && exists(dir)) fail(`Ya existe la carpeta ${relative(process.cwd(), dir) || dir}.`, "Usa --dir <otra> o --no-clone");
		if (opts.clone && !(await hasCommand("git"))) fail("Necesitas git para clonar el repo.", "Instálalo o usa --no-clone");

		// 3. Say exactly what's about to be created, and confirm
		p.note(
			[
				`${dim("App")}         ${bold(name)}`,
				`${dim("Empresa")}     ${company}`,
				`${dim("Owner")}       ${owner}${firstName ? dim(` (${firstName})`) : ""}`,
				`${dim("Color")}       ${color ?? dim("por defecto")}`,
				"",
				dim("Se crea:"),
				`  • Repo privado ${cyan(`platicamx/${name}`)}`,
				"  • Proyecto de Supabase (≈ $10 USD/mes)",
				"  • Servicio de Cloud Run con deploy automático",
				`  • Usuario owner con contraseña temporal`,
				opts.clone ? `  • Carpeta ${cyan(relative(process.cwd(), dir) || ".")} con el .env listo` : "",
			]
				.filter((l) => l !== "")
				.join("\n"),
			"Resumen"
		);
		if (interactive && !opts.yes) {
			const go = unwrap(await p.confirm({ message: "¿Crear la app?", initialValue: true }));
			if (!go) {
				p.cancel("No se creó nada.");
				process.exit(0);
			}
		}

		try {
			({ app } = await api<{ app: App }>("/api/cli/apps", {
				method: "POST",
				body: { slug: name, ownerEmail: owner, ownerFirstName: firstName, ownerLastName: opts.lastName, company, color },
			}));
		} catch (e) {
			handleError(e);
		}
	}

	// 4. Provision, then clone + .env
	const { app: finished, ownerPassword } = await provision(app!);

	if (opts.clone && finished.cloneUrl) {
		const s = spinner();
		s.start("Clonando el repo");
		try {
			if (exists(dir)) throw new Error(`ya existe ${dir}`);
			await run("git", ["clone", "--quiet", finished.cloneUrl, dir], undefined, true);
			s.message("Escribiendo el .env");
			const { env } = await api<{ env: string }>(`/api/cli/apps/${finished.slug}/env`, { method: "POST" });
			await writeFile(resolve(dir, ".env"), env, { mode: 0o600 });
			s.stop(`${green("✓")} Código en ${cyan(relative(process.cwd(), dir) || ".")} con el .env listo`);
		} catch (e) {
			s.error(`No se pudo clonar: ${(e as Error).message}`);
			p.log.message(dim(`Hazlo después: git clone ${finished.cloneUrl} && assembly env pull ${finished.slug}`));
		}
	}

	printApp(finished);
	if (ownerPassword) {
		p.note(
			`${dim("Correo")}       ${finished.ownerEmail}\n${dim("Contraseña")}   ${bold(cyan(ownerPassword))}\n\n` +
				dim("Se muestra solo esta vez y no se guarda en ningún lado.\nLa cambia en su primer inicio de sesión."),
			"Acceso del owner"
		);
	} else {
		p.log.message(dim(`El owner ya existía. Si no tiene su contraseña: assembly reset-owner ${finished.slug}`));
	}

	const next = opts.clone
		? [`cd ${relative(process.cwd(), dir) || "."}`, "npm install", "npm run dev"]
		: [`git clone ${finished.cloneUrl}`, `assembly env pull ${finished.slug}`];
	p.outro(`${green("Listo.")} Siguientes pasos:\n\n${next.map((c) => `   ${dim("$")} ${c}`).join("\n")}\n\n   ${dim("Cada push a main migra y despliega solo.")}`);
}

const seconds = (ms: number) => (ms < 60_000 ? `${Math.round(ms / 1000)}s` : `${Math.floor(ms / 60_000)}m ${Math.round((ms % 60_000) / 1000)}s`);

/** Drives the server-side state machine, one step per request. Ctrl+C is safe: re-run to resume. */
async function provision(app: App) {
	const s = spinner();
	let ownerPassword: string | null | undefined;
	const doneSteps = new Set(app.steps.filter((x) => x.status === "done").map((x) => x.name));
	const current = (a: App) => a.steps.find((x) => x.status !== "done");
	const total = app.steps.length;
	const progress = (a: App) => dim(`[${a.steps.filter((x) => x.status === "done").length + 1}/${total}]`);
	let stepStarted = Date.now();

	process.once("SIGINT", () => {
		s.stop(dim("Pausado"));
		p.log.info(`Nada se perdió. Retoma con: ${cyan(`assembly create ${app.slug}`)}`);
		process.exit(130);
	});

	for (const step of app.steps) if (step.status === "done") p.log.success(dim(step.label));
	s.start(`${progress(app)} ${current(app)?.label ?? "Terminando"}`);

	while (true) {
		let res: { app: App; wait: number; error: string | null; ownerPassword?: string | null };
		try {
			res = await api(`/api/cli/apps/${app.slug}/advance`, { method: "POST" });
		} catch (e) {
			// Transient network/service errors: keep going
			if (e instanceof ApiError && (e.status === 0 || e.status >= 500)) {
				s.message(`${progress(app)} ${current(app)?.label} ${dim("· reintentando…")}`);
				await sleep(5_000);
				continue;
			}
			s.error("Error");
			handleError(e);
		}
		app = res.app;
		if (res.ownerPassword !== undefined) ownerPassword = res.ownerPassword;

		for (const step of app.steps) {
			if (step.status === "done" && !doneSteps.has(step.name)) {
				doneSteps.add(step.name);
				s.stop(`${step.label} ${dim(seconds(Date.now() - stepStarted))}`);
				stepStarted = Date.now();
				if (current(app)) s.start(`${progress(app)} ${current(app)!.label}`);
			}
		}

		if (res.error) {
			s.error(red(`${current(app)?.label ?? "Paso"}: ${res.error}`));
			fail("Se detuvo en este paso.", `Corrige el problema y vuelve a correr: assembly create ${app.slug}`);
		}
		if (app.status === "ready") break;
		s.message(`${progress(app)} ${current(app)?.label} ${dim(seconds(Date.now() - stepStarted))}`);
		await sleep(res.wait * 1000);
	}
	return { app, ownerPassword };
}
