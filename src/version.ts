import { createRequire } from "node:module";

// package.json sits next to dist/ in the published package
const pkg = createRequire(import.meta.url)("../package.json") as { version: string };
export const VERSION = pkg.version;
