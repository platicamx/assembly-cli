import * as p from "@clack/prompts";
import { api } from "../api.ts";
import { bold, cyan, dim, green, handleError, spinner } from "../util.ts";

type McpStatus = { supported: boolean; enabled: boolean; url: string | null; agentsPage: string | null };

/**
 * AI agents (MCP): turns on agent sign-in for the app if needed and prints
 * how to connect Claude, Cursor, Codex… to it.
 */
export async function mcp(slug: string) {
	const s = spinner();
	s.start(`Revisando el MCP de ${slug}`);
	try {
		let status = await api<McpStatus>(`/api/cli/apps/${slug}/mcp`);
		if (!status.supported) {
			s.error("Esta app todavía no tiene el módulo MCP");
			p.log.message(
				dim(
					"Las apps nuevas ya lo traen. En esta, trae los cambios de la plantilla\n" +
						"(svelte-saas-template: módulo MCP) y vuelve a correr este comando."
				)
			);
			return;
		}
		if (!status.enabled) {
			s.message("Activando el login para agentes (Supabase OAuth)");
			status = await api<McpStatus>(`/api/cli/apps/${slug}/mcp`, { method: "POST" });
		}
		s.stop(`${green("✓")} MCP listo en ${bold(slug)}`);

		const url = status.url!;
		const lines = [
			bold("URL del servidor MCP"),
			cyan(url),
			"",
			bold("Claude"),
			"Ajustes → Conectores → Agregar conector personalizado → pega la URL",
			"",
			bold("Claude Code"),
			`claude mcp add --transport http ${slug} ${url}`,
			"",
			bold("Codex"),
			`codex mcp add ${slug} --url ${url}`,
			"",
			bold("Cursor") + dim("  (~/.cursor/mcp.json)"),
			JSON.stringify({ mcpServers: { [slug]: { url } } }),
			"",
			dim("Al conectar, el agente abre la app: inicia sesión y da clic en Permitir."),
			dim("Actúa como tú, con tu rol. Más agentes y quién está conectado, en Configuración → MCP:"),
			dim(status.agentsPage ?? `${url.replace(/\/mcp$/, "")}/settings/mcp`),
		];
		p.log.message(lines.join("\n"));
	} catch (e) {
		s.error("No se pudo revisar el MCP");
		handleError(e);
	}
}
