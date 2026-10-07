/**
 * Check and compile as used by tools, /paper commands and the end-of-turn gate: PAPER.md supplies
 * defaults, results update the session state that <paper_state> and the status line report.
 */

import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { type CheckMode, type CheckReport, formatReport, runChecker } from "./checker.ts";
import { type CompileResult, compileLatex, compileNeedsFix, detectEngine, type Engine, formatCompile } from "./latex.ts";
import { REPORTS_DIR } from "./paths.ts";
import { isPaperWorkspace, type PaperState } from "./state.ts";
import { latexProjectOf, loadPaperConfig } from "./workspace.ts";

export interface CheckRequest {
	path: string;
	bib?: string;
	notes?: string;
	/** Evidence ledger; default: the workspace ledger when it exists. false disables the comparison. */
	ledger?: string | false;
	mode?: CheckMode;
	final?: boolean;
	abstractWords?: number;
	titleWords?: number;
}

export interface CheckOutcome {
	report: CheckReport;
	reportPath: string;
	text: string;
	path: string;
	final: boolean;
}

export async function checkFile(
	state: PaperState,
	cwd: string,
	request: CheckRequest,
	signal?: AbortSignal,
): Promise<CheckOutcome> {
	const config = loadPaperConfig(cwd);
	const path = resolve(cwd, request.path);
	const isManuscript = path === config.manuscript;
	const existing = (p: string | undefined) => (p && existsSync(p) ? p : undefined);
	// A .tex manuscript finds its .bib through \bibliography; pass one only when asked.
	const bib = request.bib ? resolve(cwd, request.bib) : undefined;
	const notes = request.notes ? resolve(cwd, request.notes) : isManuscript ? existing(config.notes) : undefined;
	const ledger =
		request.ledger === false ? undefined : request.ledger ? resolve(cwd, request.ledger) : existing(config.evidence);
	const final = request.final ?? false;
	const { report, reportPath } = await runChecker({
		input: path,
		bib,
		notes,
		ledger,
		mode: request.mode,
		final,
		abstractWords: request.abstractWords ?? (isManuscript ? config.abstractWords : undefined),
		titleWords: request.titleWords ?? (isManuscript ? config.titleWords : undefined),
		reportDir: isPaperWorkspace(cwd) ? join(cwd, REPORTS_DIR) : undefined,
		cwd,
		signal,
	});
	state.lastCheck = { path, errors: report.errors, warnings: report.warnings, final, at: new Date().toISOString() };
	state.unchecked.delete(path);
	if (notes) state.unchecked.delete(notes);
	if (bib) state.unchecked.delete(bib);
	// Checking the main .tex reads every included file and the bibliography.
	const project = latexProjectOf(config, path);
	if (project && path === config.manuscript) {
		for (const file of [...state.unchecked]) if (latexProjectOf(config, file) === project) state.unchecked.delete(file);
	}
	return { report, reportPath, text: formatReport(report, reportPath, final), path, final };
}

export interface CompileOutcome {
	result?: CompileResult;
	text: string;
	needsFix: boolean;
}

export async function compileProject(
	state: PaperState,
	cwd: string,
	main: string | undefined,
	options: { engine?: Engine; signal?: AbortSignal } = {},
): Promise<CompileOutcome> {
	const config = loadPaperConfig(cwd);
	const target = main ? resolve(cwd, main) : config.manuscript;
	if (!target || !target.endsWith(".tex")) {
		return { text: "No LaTeX manuscript: pass the main .tex file or set 'Manuscript:' in PAPER.md.", needsFix: false };
	}
	if (!existsSync(target)) return { text: `${target} does not exist.`, needsFix: false };
	const engine = detectEngine(options.engine);
	if (!engine) {
		return {
			text: "No LaTeX engine found (tectonic or latexmk). The PDF was not built; tell the user to install tectonic, or set R2P_TECTONIC / R2P_LATEXMK.",
			needsFix: false,
		};
	}
	const result = await compileLatex({ main: target, engine, signal: options.signal });
	if (options.engine && options.engine !== engine.engine) {
		result.notes.unshift(`${options.engine} is not installed; compiled with ${engine.engine} instead.`);
	}
	const needsFix = compileNeedsFix(result);
	state.lastCompile = {
		main: target,
		ok: result.ok,
		problems:
			result.errors.length +
			result.undefinedReferences.length +
			result.undefinedCitations.length +
			result.multiplyDefinedLabels.length +
			result.missingFiles.length,
		pages: result.pages,
		at: new Date().toISOString(),
	};
	state.uncompiled.delete(dirname(target));
	return { result, text: formatCompile(result, cwd), needsFix };
}
