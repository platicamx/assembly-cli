import { styleText } from "node:util";
import { api } from "../api.ts";
import { dim, fail, handleError, sleep } from "../util.ts";

type Line = { id: string; time: string; severity: string; message: string };

/** "15m", "2h", "1d" → ISO timestamp that far back. */
function parseSince(value = "1h") {
	const m = value.match(/^(\d+)([smhd])$/);
	if (!m) fail("--since debe ser como 30m, 2h o 1d.");
	const ms = { s: 1_000, m: 60_000, h: 3_600_000, d: 86_400_000 }[m[2] as "s" | "m" | "h" | "d"];
	return new Date(Date.now() - Number(m[1]) * ms).toISOString();
}

function print(line: Line) {
	const time = dim(new Date(line.time).toLocaleTimeString("es-MX", { hour12: false }));
	const sev = line.severity;
	const color = sev === "ERROR" || sev === "CRITICAL" || sev === "ALERT" || sev === "EMERGENCY" ? "red" : sev === "WARNING" ? "yellow" : null;
	const text = color ? styleText(color, line.message) : line.message;
	console.log(`${time} ${text}`);
}

export async function logs(slug: string, opts: { since?: string; errors: boolean; follow: boolean; limit?: string }) {
	let since = parseSince(opts.since);
	const seen = new Set<string>();
	const query = () =>
		`/api/cli/apps/${slug}/logs?since=${encodeURIComponent(since)}&limit=${opts.limit ?? 200}${opts.errors ? "&errors=1" : ""}`;

	try {
		const { lines } = await api<{ lines: Line[] }>(query());
		if (!lines.length && !opts.follow) console.log(dim("Sin logs en ese periodo. Prueba con --since 1d"));
		for (const line of lines) {
			seen.add(line.id);
			print(line);
		}
		if (lines.length) since = lines.at(-1)!.time;
		if (!opts.follow) return;

		console.log(dim("— siguiendo los logs en vivo (Ctrl+C para salir) —"));
		while (true) {
			await sleep(3_000);
			const { lines: next } = await api<{ lines: Line[] }>(query()).catch(() => ({ lines: [] as Line[] }));
			for (const line of next) {
				if (seen.has(line.id)) continue;
				seen.add(line.id);
				print(line);
			}
			if (next.length) since = next.at(-1)!.time;
		}
	} catch (e) {
		handleError(e);
	}
}
