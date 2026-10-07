import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { PAPER_FILE, STATE_DIR } from "./paths.ts";

export type ModeSource = "flag" | "workspace" | "command";

export interface CheckSummary {
	path: string;
	errors: number;
	warnings: number;
	final: boolean;
	at: string;
}

export interface CompileSummary {
	main: string;
	ok: boolean;
	/** Errors plus undefined references/citations, missing files and duplicate labels. */
	problems: number;
	pages?: number;
	at: string;
}

/** Session-scoped state of the paper agent. Plain data so it can be rebuilt after reload. */
export interface PaperState {
	/** Explicit /paper on|off for this session; undefined means "decide from flag and workspace". */
	override: boolean | undefined;
	lastCheck: CheckSummary | undefined;
	lastCompile: CompileSummary | undefined;
	/** Manuscript-like files written or edited since they were last checked (absolute paths). */
	unchecked: Set<string>;
	/** LaTeX projects (folder of the main .tex) with source changes since the last compile. */
	uncompiled: Set<string>;
	/** Files the agent created in this session; overwriting them needs no confirmation. */
	agentFiles: Set<string>;
	/** Automatic fix rounds the end-of-turn gate has started since the last user input. */
	autoRounds: number;
}

export function createState(): PaperState {
	return {
		override: undefined,
		lastCheck: undefined,
		lastCompile: undefined,
		unchecked: new Set(),
		uncompiled: new Set(),
		agentFiles: new Set(),
		autoRounds: 0,
	};
}

export function isPaperWorkspace(cwd: string): boolean {
	return existsSync(join(cwd, PAPER_FILE)) || existsSync(join(cwd, STATE_DIR));
}

/** Paper mode is on when /paper says so, else when --paper is set or the cwd is a paper workspace. */
export function resolveMode(
	state: PaperState,
	flag: boolean,
	cwd: string,
): { active: boolean; source: ModeSource | undefined } {
	if (state.override !== undefined) return { active: state.override, source: "command" };
	if (flag) return { active: true, source: "flag" };
	if (isPaperWorkspace(cwd)) return { active: true, source: "workspace" };
	return { active: false, source: undefined };
}

const MANUSCRIPT_EXT = /\.(?:md|tex|bib|txt)$/i;
/** Files whose change makes the PDF stale. */
export const LATEX_SOURCE_EXT = /\.(?:tex|bib|sty|cls|bst|png|jpe?g|pdf|eps|svg)$/i;

/** Files the checker should see after they change: drafts, letters, bibliographies; not agent state. */
export function isManuscriptFile(cwd: string, path: string): boolean {
	const abs = resolve(cwd, path);
	const stateDir = resolve(cwd, STATE_DIR);
	if (abs === stateDir || abs.startsWith(stateDir + "\\") || abs.startsWith(stateDir + "/")) return false;
	if (abs === resolve(cwd, PAPER_FILE)) return false;
	return MANUSCRIPT_EXT.test(abs);
}
