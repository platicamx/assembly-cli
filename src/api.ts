import { apiUrl, loadCredentials } from "./config.ts";
import { VERSION } from "./version.ts";

export class ApiError extends Error {
	constructor(
		public status: number,
		message: string
	) {
		super(message);
	}
}

type Options = { method?: string; body?: unknown; auth?: boolean; baseUrl?: string };

/** Calls the Assembly service. Every request carries the CLI version so old CLIs get a clear "update" message. */
export async function api<T>(path: string, { method = "GET", body, auth = true, baseUrl }: Options = {}): Promise<T> {
	const credentials = auth ? await loadCredentials() : null;
	if (auth && !credentials) throw new ApiError(401, "No has iniciado sesión. Corre: assembly login");

	let res: Response;
	try {
		res = await fetch(`${baseUrl ?? apiUrl(credentials?.apiUrl)}${path}`, {
			method,
			headers: {
				accept: "application/json",
				"content-type": "application/json",
				"x-assembly-cli-version": VERSION,
				...(credentials && { authorization: `Bearer ${credentials.token}` }),
			},
			body: body === undefined ? undefined : JSON.stringify(body),
			signal: AbortSignal.timeout(90_000),
		});
	} catch (e) {
		throw new ApiError(0, `No pudimos conectar con el servicio de Assembly (${(e as Error).message})`);
	}

	const text = await res.text();
	let data: unknown = null;
	try {
		data = text ? JSON.parse(text) : null;
	} catch {}
	if (!res.ok) {
		let message = (data as { message?: string } | null)?.message ?? `Error ${res.status}`;
		if (res.status >= 500 && /^internal error$/i.test(message)) {
			message = "El servicio de Assembly tuvo un error inesperado. Intenta de nuevo en un momento; si se repite, avísale al equipo.";
		}
		throw new ApiError(res.status, message);
	}
	return data as T;
}

export type Step = { name: string; label: string; status: "pending" | "done" | "failed"; error: string | null };

export type App = {
	slug: string;
	status: "provisioning" | "ready" | "destroyed";
	url: string;
	repoUrl: string | null;
	cloneUrl: string | null;
	supabaseUrl: string | null;
	supabaseDashboard: string | null;
	deployRunUrl: string | null;
	ownerEmail: string;
	company: string;
	createdBy: string;
	createdAt: string;
	steps: Step[];
};
