import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/** Repository / package root: agent/src/ → ../.. */
export const PACKAGE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");

/** The canonical skill: writing rules, references and the checker live here, not in the agent. */
export const SKILL_DIR = join(PACKAGE_ROOT, "skills", "research2paper");
export const SKILL_FILE = join(SKILL_DIR, "SKILL.md");
export const CHECKER_SCRIPT = join(SKILL_DIR, "scripts", "check_paper_draft.py");
export const FILL_GAPS_SCRIPT = join(SKILL_DIR, "scripts", "fill_gaps.py");

export const TEMPLATES_DIR = join(PACKAGE_ROOT, "agent", "templates");

/** Workspace markers: either one switches paper mode on. */
export const PAPER_FILE = "PAPER.md";
export const STATE_DIR = ".r2p";
export const REPORTS_DIR = join(STATE_DIR, "reports");

/** Forward slashes keep prompt text identical across platforms. */
export function toPosix(path: string): string {
	return path.replace(/\\/g, "/");
}
