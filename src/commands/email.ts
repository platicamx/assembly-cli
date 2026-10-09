import * as p from "@clack/prompts";
import { api } from "../api.ts";
import { bold, dim, green, handleError, spinner } from "../util.ts";

/** Turns on / refreshes the app's email (Resend + Supabase SMTP + templates). */
export async function email(slug: string) {
	const s = spinner();
	s.start(`Configurando el correo de ${slug}`);
	try {
		const res = await api<{ from: string; domain: string; hasInviteTemplate: boolean }>(`/api/cli/apps/${slug}/email`, {
			method: "POST",
		});
		s.stop(`${green("✓")} Correo listo: ${bold(res.from)}`);
		p.log.message(
			dim(
				"Ya funcionan las invitaciones y los enlaces para restablecer contraseña\n" +
					"(Configuración → Usuarios) y “¿Olvidaste tu contraseña?”.\n" +
					`Para usar sendEmail() en local: assembly env pull ${slug}`
			)
		);
		if (!res.hasInviteTemplate) {
			p.log.warn("El repo no tiene supabase/templates/invite.html: las invitaciones usan el texto por defecto de Supabase.");
		}
	} catch (e) {
		s.error("No se pudo configurar el correo");
		handleError(e);
	}
}
