import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { PAPER_FILE, STATE_DIR, TEMPLATES_DIR, toPosix } from "./paths.ts";

/** Fixed layout of a paper workspace created by paper_init. PAPER.md can point elsewhere. */
export const LAYOUT = {
	materials: "materials",
	paper: "paper",
	manuscript: "paper/main.tex",
	bibliography: "paper/refs.bib",
	notes: "notes/memo.md",
	evidence: "notes/evidence.json",
} as const;

export const LATEX_TEMPLATES = ["article", "elsarticle", "ieeetran"] as const;
export type LatexTemplate = (typeof LATEX_TEMPLATES)[number];

/** What PAPER.md says, resolved to absolute paths. Missing fields stay undefined. */
export interface PaperConfig {
	journal?: string;
	abstractWords?: number;
	titleWords?: number;
	manuscript?: string;
	bibliography?: string;
	notes?: string;
	/** Evidence ledger (JSON); checks pass it to the checker as --ledger when it exists. */
	evidence?: string;
	materials: string;
}

/** Reads the "- Key: value" lines of PAPER.md; unknown keys are ignored, empty values mean "not set". */
export function parsePaperFile(text: string): Record<string, string> {
	const fields: Record<string, string> = {};
	for (const line of text.split(/\r?\n/)) {
		const m = line.match(/^\s*[-*]\s*([^:：]+?)\s*[:：]\s*(.*?)\s*$/);
		if (!m) continue;
		const value = m[2].replace(/^`(.*)`$/, "$1").trim();
		if (value) fields[m[1].toLowerCase()] = value;
	}
	return fields;
}

function positiveInt(value: string | undefined): number | undefined {
	const n = value ? Number.parseInt(value, 10) : Number.NaN;
	return Number.isFinite(n) && n > 0 ? n : undefined;
}

export function loadPaperConfig(cwd: string): PaperConfig {
	const file = join(cwd, PAPER_FILE);
	const fields = existsSync(file) ? parsePaperFile(readFileSync(file, "utf8")) : {};
	const path = (value: string | undefined, fallback?: string) => {
		const chosen = value ?? fallback;
		if (!chosen) return undefined;
		const abs = resolve(cwd, chosen);
		return value || existsSync(abs) ? abs : undefined;
	};
	return {
		journal: fields.journal,
		abstractWords: positiveInt(fields["abstract word limit"]),
		titleWords: positiveInt(fields["title word limit"]),
		manuscript: path(fields.manuscript, LAYOUT.manuscript),
		bibliography: path(fields.bibliography, LAYOUT.bibliography),
		notes: path(fields.notes, LAYOUT.notes),
		evidence: path(fields.evidence, LAYOUT.evidence),
		materials: resolve(cwd, fields.materials ?? LAYOUT.materials),
	};
}

/** Where the evidence ledger lives (or will be created): PAPER.md's Evidence field, else notes/evidence.json. */
export function ledgerPathFor(cwd: string): string {
	return loadPaperConfig(cwd).evidence ?? join(cwd, LAYOUT.evidence);
}

export function isInside(dir: string, path: string): boolean {
	const rel = relative(dir, path);
	return rel === "" || (!rel.startsWith("..") && !rel.startsWith(sep) && !/^[a-zA-Z]:/.test(rel));
}

/** The LaTeX project a file belongs to: the folder of the configured .tex manuscript. */
export function latexProjectOf(config: PaperConfig, path: string): string | undefined {
	if (!config.manuscript?.endsWith(".tex")) return undefined;
	const dir = dirname(config.manuscript);
	return isInside(dir, path) ? dir : undefined;
}

export interface InitResult {
	created: string[];
	skipped: string[];
}

function copyTree(from: string, to: string, cwd: string, result: InitResult): void {
	for (const name of readdirSync(from)) {
		const src = join(from, name);
		const dst = join(to, name);
		if (statSync(src).isDirectory()) {
			mkdirSync(dst, { recursive: true });
			copyTree(src, dst, cwd, result);
		} else if (existsSync(dst)) {
			result.skipped.push(toPosix(relative(cwd, dst)));
		} else {
			copyFileSync(src, dst);
			result.created.push(toPosix(relative(cwd, dst)));
		}
	}
}

/**
 * Create the workspace without touching anything that exists: PAPER.md, materials/, the LaTeX
 * skeleton for `template`, notes/memo.md and a .gitignore for build output and agent state.
 */
export function initWorkspace(cwd: string, template: LatexTemplate, journal?: string): InitResult {
	const result: InitResult = { created: [], skipped: [] };
	const write = (rel: string, content: string) => {
		const abs = join(cwd, rel);
		if (existsSync(abs)) {
			result.skipped.push(rel);
			return;
		}
		mkdirSync(dirname(abs), { recursive: true });
		writeFileSync(abs, content);
		result.created.push(rel);
	};

	const paperTemplate = readFileSync(join(TEMPLATES_DIR, PAPER_FILE), "utf8")
		.replace("- Journal:", `- Journal:${journal ? ` ${journal}` : ""}`)
		.replace("- LaTeX template:", `- LaTeX template: ${template}`);
	write(PAPER_FILE, paperTemplate);
	mkdirSync(join(cwd, LAYOUT.materials), { recursive: true });
	mkdirSync(join(cwd, LAYOUT.paper, "figures"), { recursive: true });
	mkdirSync(join(cwd, STATE_DIR), { recursive: true });
	copyTree(join(TEMPLATES_DIR, "latex", "common"), join(cwd, LAYOUT.paper), cwd, result);
	copyTree(join(TEMPLATES_DIR, "latex", template), join(cwd, LAYOUT.paper), cwd, result);
	write(LAYOUT.notes, readFileSync(join(TEMPLATES_DIR, "memo.md"), "utf8"));
	write(LAYOUT.evidence, `${JSON.stringify({ version: 1, entries: [] }, null, "\t")}\n`);
	write(".gitignore", `${LAYOUT.paper}/build/\n${STATE_DIR}/\n`);
	return result;
}
