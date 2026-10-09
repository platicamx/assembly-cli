import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { styleText } from "node:util";
import * as p from "@clack/prompts";
import { ApiError } from "./api.ts";

export const dim = (s: string) => styleText("dim", s);
export const bold = (s: string) => styleText("bold", s);
export const green = (s: string) => styleText("green", s);
export const red = (s: string) => styleText("red", s);
export const cyan = (s: string) => styleText("cyan", s);

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Exit cleanly when the user presses Ctrl+C or Esc on a prompt. */
export function unwrap<T>(value: T): Exclude<T, symbol> {
	if (p.isCancel(value)) {
		p.cancel("Cancelado.");
		process.exit(130);
	}
	return value as Exclude<T, symbol>;
}

export function fail(message: string, hint?: string): never {
	p.log.error(message);
	if (hint) p.log.message(dim(hint));
	process.exit(1);
}

/** Prints API errors nicely; anything else is a bug and keeps its stack. */
export function handleError(e: unknown): never {
	if (e instanceof ApiError) fail(e.message);
	throw e;
}

/** Runs a command. `quiet` captures output (so it doesn't break a spinner) and reports stderr on failure. */
export function run(cmd: string, args: string[], cwd?: string, quiet = false) {
	return new Promise<void>((resolve, reject) => {
		const child = spawn(cmd, args, { cwd, stdio: quiet ? ["ignore", "ignore", "pipe"] : "inherit" });
		let stderr = "";
		child.stderr?.on("data", (d) => (stderr += d));
		child.on("error", reject);
		child.on("exit", (code) =>
			code === 0 ? resolve() : reject(new Error(stderr.trim().split("\n").pop() || `${cmd} terminó con código ${code}`))
		);
	});
}

export function hasCommand(cmd: string) {
	return new Promise<boolean>((resolve) => {
		const child = spawn(cmd, ["--version"], { stdio: "ignore" });
		child.on("error", () => resolve(false));
		child.on("exit", (code) => resolve(code === 0));
	});
}

/** Opens a URL in the default browser without extra dependencies. */
export function openBrowser(url: string) {
	const [cmd, args] =
		process.platform === "darwin"
			? ["open", [url]]
			: process.platform === "win32"
				? ["cmd", ["/c", "start", "", url]]
				: ["xdg-open", [url]];
	const child = spawn(cmd, args, { stdio: "ignore", detached: true });
	child.on("error", () => {});
	child.unref();
}

export const exists = (path: string) => existsSync(path);

/**
 * Spinner that degrades for agents and CI: outside a TTY it prints one clean
 * line per start/stop instead of animation frames.
 */
export function spinner() {
	if (process.stdout.isTTY) return p.spinner();
	return {
		start: (msg?: string) => msg && console.log(`… ${msg}`),
		message: (_msg?: string) => {},
		stop: (msg?: string) => msg && console.log(msg),
		error: (msg?: string) => msg && console.error(`✗ ${msg}`),
		cancel: (msg?: string) => msg && console.error(msg),
		clear: () => {},
		isCancelled: false,
	};
}
