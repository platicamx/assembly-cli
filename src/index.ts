#!/usr/bin/env node
import { parseArgs } from "node:util";
import * as p from "@clack/prompts";
import { banner } from "./banner.ts";
import { create } from "./commands/create.ts";
import { envPull } from "./commands/env.ts";
import { login, logout, whoami } from "./commands/login.ts";
import { deploy, destroy, isolate, resetOwner } from "./commands/manage.ts";
import { list, status } from "./commands/status.ts";
import { logs } from "./commands/logs.ts";
import { types } from "./commands/types.ts";
import { email } from "./commands/email.ts";
import { secretsList, secretsSet, secretsUnset } from "./commands/secrets.ts";
import { checkForUpdate } from "./update-check.ts";
import { bold, cyan, dim, fail } from "./util.ts";
import { VERSION } from "./version.ts";

type Values = Record<string, string | boolean | undefined>;
type Command = {
	name: string;
	aliases?: string[];
	group: "Sesión" | "Apps";
	usage: string;
	summary: string;
	options?: [string, string][];
	examples?: string[];
	run: (args: string[], values: Values) => Promise<unknown>;
};

const str = (v: unknown) => (typeof v === "string" ? v : undefined);
const arg = (args: string[], i: number, usage: string) => args[i] ?? fail(`Falta un argumento.`, `Uso: ${usage}`);

const COMMANDS: Command[] = [
	{
		name: "login",
		group: "Sesión",
		usage: "assembly login",
		summary: "Inicia sesión con tu cuenta del portal",
		options: [["--api <url>", "Otro servicio (p. ej. http://localhost:5173 para desarrollo)"]],
		run: (_, v) => login({ api: str(v.api) }),
	},
	{ name: "logout", group: "Sesión", usage: "assembly logout", summary: "Cierra la sesión y revoca el token", run: () => logout() },
	{ name: "whoami", group: "Sesión", usage: "assembly whoami", summary: "Muestra con qué cuenta estás", run: () => whoami() },
	{
		name: "create",
		aliases: ["new"],
		group: "Apps",
		usage: "assembly create [nombre] [--owner <correo>]",
		summary: "Crea y despliega una app nueva",
		options: [
			["--owner <correo>", "Correo del owner (primer usuario de la app)"],
			["--company <nombre>", "Nombre de la empresa"],
			["--color <#hex>", "Color de marca, p. ej. #2f6fe0"],
			["--first-name, --last-name", "Nombre del owner"],
			["--dir <carpeta>", "Dónde clonar (por defecto ./<nombre>)"],
			["--no-clone", "No clonar ni escribir el .env"],
			["-y, --yes", "No pedir confirmación"],
		],
		examples: ["assembly create", 'assembly create acme-crm --owner ana@acme.com --company "Acme"'],
		run: (args, v) =>
			create(args[0], {
				owner: str(v.owner),
				company: str(v.company),
				color: str(v.color),
				firstName: str(v["first-name"]),
				lastName: str(v["last-name"]),
				dir: str(v.dir),
				clone: !v["no-clone"],
				yes: !!v.yes,
			}),
	},
	{ name: "list", aliases: ["ls"], group: "Apps", usage: "assembly list", summary: "Apps del equipo", run: () => list() },
	{
		name: "status",
		group: "Apps",
		usage: "assembly status <nombre>",
		summary: "Estado, URL y enlaces de una app",
		run: (a) => status(arg(a, 0, "assembly status <nombre>")),
	},
	{
		name: "env",
		group: "Apps",
		usage: "assembly env pull <nombre>",
		summary: "Escribe un .env con tu llave personal",
		options: [
			["--dir <carpeta>", "Dónde escribirlo (por defecto la carpeta actual)"],
			["--force", "Reemplazar sin preguntar"],
		],
		run: (a, v) => {
			if (a[0] !== "pull") fail("Uso: assembly env pull <nombre>");
			return envPull(arg(a, 1, "assembly env pull <nombre>"), { dir: str(v.dir), force: !!v.force });
		},
	},
	{
		name: "deploy",
		group: "Apps",
		usage: "assembly deploy <nombre>",
		summary: "Migra y despliega main a Cloud Run",
		run: (a) => deploy(arg(a, 0, "assembly deploy <nombre>")),
	},
	{
		name: "isolate",
		group: "Apps",
		usage: "assembly isolate <nombre>",
		summary: "Da a una app existente sus propias identidades en GCP",
		run: (a) => isolate(arg(a, 0, "assembly isolate <nombre>")),
	},
	{
		name: "secrets",
		group: "Apps",
		usage: "assembly secrets <set|list|unset> <app> [NOMBRE]",
		summary: "Llaves de la app en producción (APIs externas)",
		options: [["-y, --yes", "unset: no pedir confirmación"]],
		examples: [
			"assembly secrets set mi-app OPENAI_API_KEY      # te pide el valor sin mostrarlo",
			"assembly secrets list mi-app",
			"assembly secrets unset mi-app OPENAI_API_KEY",
			"pbpaste | assembly secrets set mi-app OPENAI_API_KEY   # desde el portapapeles",
		],
		run: (a, v) => {
			const [sub, app, name, value] = a;
			const usage = "assembly secrets <set|list|unset> <app> [NOMBRE]";
			if (sub === "list" || sub === "ls") return secretsList(arg(a, 1, usage));
			if (sub === "set") return secretsSet(arg(a, 1, usage), arg(a, 2, "assembly secrets set <app> NOMBRE"), value);
			if (sub === "unset" || sub === "rm") return secretsUnset(arg(a, 1, usage), arg(a, 2, "assembly secrets unset <app> NOMBRE"), { yes: !!v.yes });
			fail(app ? `Subcomando desconocido: ${sub}` : "Falta el subcomando.", `Uso: ${usage}`);
		},
	},
	{
		name: "logs",
		group: "Apps",
		usage: "assembly logs <app>",
		summary: "Logs de producción (Cloud Run)",
		options: [
			["-f, --follow", "Seguir en vivo"],
			["--since <30m|2h|1d>", "Desde hace cuánto (por defecto 1h)"],
			["--errors", "Solo errores"],
			["--limit <n>", "Máximo de líneas (por defecto 200)"],
		],
		examples: ["assembly logs mi-app -f", "assembly logs mi-app --errors --since 1d"],
		run: (a, v) =>
			logs(arg(a, 0, "assembly logs <app>"), {
				since: str(v.since),
				errors: !!v.errors,
				follow: !!v.follow,
				limit: str(v.limit),
			}),
	},
	{
		name: "email",
		group: "Apps",
		usage: "assembly email <app>",
		summary: "Activa o actualiza el correo de la app",
		examples: ["assembly email mi-app   # también después de cambiar supabase/templates/"],
		run: (a) => email(arg(a, 0, "assembly email <app>")),
	},
	{
		name: "types",
		group: "Apps",
		usage: "assembly types <app>",
		summary: "Regenera los tipos de la base de datos",
		options: [["--out <archivo>", "Destino (por defecto src/lib/types/database.ts)"]],
		examples: ["assembly types mi-app"],
		run: (a, v) => types(arg(a, 0, "assembly types <app>"), { out: str(v.out) }),
	},
	{
		name: "reset-owner",
		group: "Apps",
		usage: "assembly reset-owner <nombre>",
		summary: "Nueva contraseña temporal para el owner",
		run: (a) => resetOwner(arg(a, 0, "assembly reset-owner <nombre>")),
	},
	{
		name: "destroy",
		group: "Apps",
		usage: "assembly destroy <nombre>",
		summary: "Elimina Cloud Run, Supabase y secretos; archiva el repo",
		options: [["-y, --yes", "No pedir que escribas el nombre"]],
		run: (a, v) => destroy(arg(a, 0, "assembly destroy <nombre>"), { yes: !!v.yes }),
	},
];

function mainHelp() {
	const pad = Math.max(...COMMANDS.map((c) => c.usage.length)) + 3;
	const groups = (["Sesión", "Apps"] as const).map(
		(g) =>
			`${bold(g)}\n` +
			COMMANDS.filter((c) => c.group === g)
				.map((c) => `  ${cyan(c.usage.padEnd(pad))}${dim(c.summary)}`)
				.join("\n")
	);
	return [
		banner(),
		`${bold("Uso")}  assembly <comando> [opciones]\n`,
		...groups.map((g) => g + "\n"),
		dim("Ayuda de un comando:   assembly <comando> --help"),
		dim("Si un create se interrumpe, vuelve a correrlo: retoma donde se quedó."),
		"",
	].join("\n");
}

function commandHelp(c: Command) {
	const lines = [`\n${bold(c.summary)}\n`, `${bold("Uso")}  ${cyan(c.usage)}`];
	if (c.options?.length) {
		const pad = Math.max(...c.options.map(([o]) => o.length)) + 3;
		lines.push(`\n${bold("Opciones")}`, ...c.options.map(([o, d]) => `  ${o.padEnd(pad)}${dim(d)}`));
	}
	if (c.examples?.length) lines.push(`\n${bold("Ejemplos")}`, ...c.examples.map((e) => `  ${dim("$")} ${e}`));
	return lines.join("\n") + "\n";
}

/** Levenshtein distance, for "did you mean …?" */
function distance(a: string, b: string) {
	const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
	for (let j = 1; j <= b.length; j++) d[0][j] = j;
	for (let i = 1; i <= a.length; i++)
		for (let j = 1; j <= b.length; j++)
			d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
	return d[a.length][b.length];
}

let parsed: ReturnType<typeof parseArgs>;
try {
	parsed = parseArgs({
		allowPositionals: true,
		options: {
			help: { type: "boolean", short: "h" },
			version: { type: "boolean", short: "v" },
			api: { type: "string" },
			owner: { type: "string" },
			company: { type: "string" },
			color: { type: "string" },
			"first-name": { type: "string" },
			"last-name": { type: "string" },
			dir: { type: "string" },
			"no-clone": { type: "boolean" },
			force: { type: "boolean" },
			yes: { type: "boolean", short: "y" },
			follow: { type: "boolean", short: "f" },
			since: { type: "string" },
			errors: { type: "boolean" },
			limit: { type: "string" },
			out: { type: "string" },
		},
	});
} catch (e) {
	fail((e as Error).message, "Ver: assembly --help");
}

const { values, positionals } = parsed;
const [name, ...args] = positionals;
const update = checkForUpdate(); // runs in the background while the command works

if (values.version) {
	console.log(VERSION);
} else if (!name) {
	console.log(mainHelp());
} else {
	const command = COMMANDS.find((c) => c.name === name || c.aliases?.includes(name));
	if (!command) {
		const guess = COMMANDS.map((c) => ({ c, d: distance(name, c.name) })).sort((a, b) => a.d - b.d)[0];
		p.log.error(`No existe el comando ${bold(name)}.`);
		if (guess.d <= 3) p.log.message(`¿Quisiste decir ${cyan(`assembly ${guess.c.name}`)}?`);
		else p.log.message(dim("Ver comandos: assembly --help"));
		process.exit(1);
	}
	if (values.help) console.log(commandHelp(command));
	else await command.run(args, values as Values);
}

const notice = await Promise.race([update, new Promise<null>((r) => setTimeout(() => r(null), 300))]);
if (notice) console.log(`\n${notice}\n`);
