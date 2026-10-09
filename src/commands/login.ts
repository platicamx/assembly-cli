import { createHash, randomBytes } from "node:crypto";
import { createServer } from "node:http";
import { hostname } from "node:os";
import * as p from "@clack/prompts";
import { api } from "../api.ts";
import { apiUrl, clearCredentials, loadCredentials, saveCredentials } from "../config.ts";
import { banner } from "../banner.ts";
import { bold, cyan, dim, fail, handleError, openBrowser, unwrap, spinner } from "../util.ts";

const b64url = (buf: Buffer) => buf.toString("base64url");

/**
 * Browser login with a loopback redirect + PKCE (like `gh auth login`):
 * the portal approves, redirects to 127.0.0.1 with a one-time code, and we
 * exchange it — together with the verifier only this process knows — for a token.
 */
export async function login(opts: { api?: string }) {
	console.log(banner());
	p.intro(bold(" assembly login "));
	const base = apiUrl(opts.api);
	const current = await loadCredentials();
	if (current && new Date(current.expiresAt) > new Date() && process.stdin.isTTY) {
		const again = unwrap(
			await p.confirm({ message: `Ya tienes sesión como ${bold(current.email)}. ¿Iniciar con otra cuenta?`, initialValue: false })
		);
		if (!again) return p.outro("Sin cambios.");
	}
	const verifier = b64url(randomBytes(32));
	const challenge = b64url(createHash("sha256").update(verifier).digest());
	const state = b64url(randomBytes(24));

	const code = await new Promise<string>((resolve, reject) => {
		const server = createServer((req, res) => {
			const url = new URL(req.url ?? "/", "http://127.0.0.1");
			if (url.pathname !== "/callback") {
				res.writeHead(404).end();
				return;
			}
			const ok = url.searchParams.get("state") === state && url.searchParams.get("code");
			res.writeHead(ok ? 200 : 400, { "content-type": "text/html; charset=utf-8" });
			res.end(
				`<!doctype html><meta charset="utf-8"><title>Assembly CLI</title>` +
					`<body style="font-family:system-ui;display:grid;place-items:center;height:90vh">` +
					`<p>${ok ? "Listo. Ya puedes volver a la terminal." : "Solicitud inválida. Vuelve a correr <code>assembly login</code>."}</p>`
			);
			if (!ok) return;
			clearTimeout(timer);
			server.close();
			resolve(url.searchParams.get("code")!);
		});
		const timer = setTimeout(() => {
			server.close();
			reject(new Error("Se acabó el tiempo (5 min) para autorizar en el navegador."));
		}, 5 * 60_000);
		server.on("error", reject);
		server.listen(0, "127.0.0.1", () => {
			const { port } = server.address() as { port: number };
			const url =
				`${base}/cli/authorize?port=${port}&state=${state}&code_challenge=${challenge}` +
				`&host=${encodeURIComponent(hostname())}`;
			p.log.step("Abriendo el navegador para autorizar…");
			p.log.message(dim(`Si no se abre, entra a:\n${url}`));
			openBrowser(url);
		});
	}).catch((e: Error) => fail(e.message));

	const s = spinner();
	s.start("Terminando el inicio de sesión");
	try {
		const result = await api<{ token: string; email: string; expiresAt: string }>("/api/cli/token", {
			method: "POST",
			auth: false,
			baseUrl: base,
			body: { code, code_verifier: verifier },
		});
		await saveCredentials({ apiUrl: base, ...result });
		s.stop(`Sesión iniciada como ${bold(result.email)}`);
		p.outro(`Crea tu primera app con ${cyan("assembly create")}`);
	} catch (e) {
		s.error("No se pudo iniciar sesión");
		handleError(e);
	}
}

export async function logout() {
	const credentials = await loadCredentials();
	if (!credentials) return p.log.info("No había sesión iniciada.");
	// Revoke on the server too; if it fails (offline) the local token is still removed
	await api("/api/cli/logout", { method: "POST" }).catch(() => {});
	await clearCredentials();
	p.log.success(`Sesión cerrada (${credentials.email}).`);
}

export async function whoami() {
	try {
		const me = await api<{ email: string; name: string }>("/api/cli/me");
		const credentials = await loadCredentials();
		p.log.info(`${bold(me.name)} <${me.email}>`);
		p.log.message(dim(`Servicio: ${apiUrl(credentials?.apiUrl)} · sesión vence ${credentials?.expiresAt.slice(0, 10)}`));
	} catch (e) {
		handleError(e);
	}
}
