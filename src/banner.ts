import { styleText } from "node:util";
import { VERSION } from "./version.ts";

/**
 * Intro banner: "ASSEMBLY" in block letters with the brand gradient
 * (teal #4A9B9B → aqua → mint #B7F3F4), like the web lockup.
 * - Truecolor terminals get the smooth gradient, others the closest 256 colors.
 * - Narrow terminals get a one-line version; NO_COLOR / pipes get plain text.
 */
const LOGO = [
	" █████╗ ███████╗███████╗███████╗███╗   ███╗██████╗ ██╗     ██╗   ██╗",
	"██╔══██╗██╔════╝██╔════╝██╔════╝████╗ ████║██╔══██╗██║     ╚██╗ ██╔╝",
	"███████║███████╗███████╗█████╗  ██╔████╔██║██████╔╝██║      ╚████╔╝ ",
	"██╔══██║╚════██║╚════██║██╔══╝  ██║╚██╔╝██║██╔══██╗██║       ╚██╔╝  ",
	"██║  ██║███████║███████║███████╗██║ ╚═╝ ██║██████╔╝███████╗   ██║   ",
	"╚═╝  ╚═╝╚══════╝╚══════╝╚══════╝╚═╝     ╚═╝╚═════╝ ╚══════╝   ╚═╝   ",
];

type RGB = [number, number, number];
const STOPS: RGB[] = [
	[0x4a, 0x9b, 0x9b], // teal (logo)
	[0x7f, 0xd1, 0xd1], // aqua
	[0xb7, 0xf3, 0xf4], // mint
];

function lerp(t: number): RGB {
	const scaled = t * (STOPS.length - 1);
	const i = Math.min(Math.floor(scaled), STOPS.length - 2);
	const f = scaled - i;
	return STOPS[i].map((c, k) => Math.round(c + (STOPS[i + 1][k] - c) * f)) as RGB;
}

const colorEnabled = () =>
	!process.env.NO_COLOR && process.env.TERM !== "dumb" && (process.stdout.isTTY || !!process.env.FORCE_COLOR);

const truecolor = () =>
	/truecolor|24bit/i.test(process.env.COLORTERM ?? "") ||
	["iTerm.app", "WezTerm", "vscode", "ghostty", "Hyper"].includes(process.env.TERM_PROGRAM ?? "");

function paint([r, g, b]: RGB, text: string) {
	if (truecolor()) return `\x1b[38;2;${r};${g};${b}m${text}\x1b[39m`;
	// Nearest color in the 6×6×6 cube of the 256-color palette
	const q = (v: number) => Math.round((v / 255) * 5);
	return `\x1b[38;5;${16 + 36 * q(r) + 6 * q(g) + q(b)}m${text}\x1b[39m`;
}

/** Colors each column by its horizontal position: a left-to-right gradient. */
function gradient(line: string, width: number) {
	return [...line].map((ch, i) => (ch === " " ? ch : paint(lerp(i / (width - 1)), ch))).join("");
}

export function banner(subtitle = "Crea y despliega apps de tu equipo") {
	const width = LOGO[0].length;
	const columns = process.stdout.columns ?? 80;
	const color = colorEnabled();
	const dim = (s: string) => (color ? styleText("dim", s) : s);

	if (columns < width + 4) {
		const mark = color ? paint(STOPS[0], "◆") : "◆";
		const name = color ? gradient("assembly", 8) : "assembly";
		return `\n ${mark} ${name} ${dim(`v${VERSION}`)}\n ${dim(subtitle)}\n`;
	}

	const art = LOGO.map((line) => "  " + (color ? gradient(line, width) : line)).join("\n");
	const tagline = `  ${dim("Systems, Inc")}  ${dim("·")}  ${dim(subtitle)}  ${dim(`v${VERSION}`)}`;
	return `\n${art}\n${tagline}\n`;
}
