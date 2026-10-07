import { execFile } from "node:child_process";
import { mkdirSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { CHECKER_SCRIPT } from "./paths.ts";

export type CheckMode = "auto" | "manuscript" | "section" | "response";

export interface CheckFinding {
	level: "ERROR" | "WARN" | "INFO";
	code: string;
	where: string;
	message: string;
}

export interface CheckReport {
	path: string;
	format: string;
	mode: string;
	errors: number;
	warnings: number;
	findings: CheckFinding[];
}

export interface CheckOptions {
	input: string;
	bib?: string;
	notes?: string;
	/** Evidence ledger JSON (--ledger): untraced numbers are reported as V01. */
	ledger?: string;
	mode?: CheckMode;
	final?: boolean;
	abstractWords?: number;
	titleWords?: number;
	/** Directory for the JSON report; a temp directory when omitted. */
	reportDir?: string;
	cwd: string;
	signal?: AbortSignal;
}

interface ProcessResult {
	code: number;
	stdout: string;
	stderr: string;
}

function run(command: string, args: string[], cwd: string, signal?: AbortSignal): Promise<ProcessResult> {
	return new Promise((resolve, reject) => {
		execFile(
			command,
			args,
			{ cwd, signal, timeout: 120_000, maxBuffer: 16 * 1024 * 1024, windowsHide: true, encoding: "utf8" },
			(error, stdout, stderr) => {
				if (error && typeof error.code !== "number") {
					reject(error);
					return;
				}
				resolve({ code: typeof error?.code === "number" ? error.code : 0, stdout, stderr });
			},
		);
	});
}

let pythonCommand: Promise<string[] | undefined> | undefined;

/** First working Python 3: R2P_PYTHON, then python3 / python / the Windows launcher. Cached per process. */
export function findPython(): Promise<string[] | undefined> {
	pythonCommand ??= (async () => {
		const candidates: string[][] = [];
		if (process.env.R2P_PYTHON) candidates.push([process.env.R2P_PYTHON]);
		if (process.platform === "win32") candidates.push(["python"], ["py", "-3"], ["python3"]);
		else candidates.push(["python3"], ["python"]);
		for (const [command, ...args] of candidates) {
			try {
				const result = await run(command, [...args, "--version"], process.cwd());
				if (result.code === 0 && /Python 3\./.test(result.stdout + result.stderr)) return [command, ...args];
			} catch {
				// not installed; try the next candidate
			}
		}
		return undefined;
	})();
	return pythonCommand;
}

/** Run one of the skill's Python scripts (standard library only) with UTF-8 I/O. */
export async function runPythonScript(
	script: string,
	args: string[],
	cwd: string,
	signal?: AbortSignal,
): Promise<ProcessResult> {
	const python = await findPython();
	if (!python) {
		throw new Error(
			"Python 3 was not found (tried R2P_PYTHON, python3, python, py -3). Install Python 3.9+ or set R2P_PYTHON; the skill scripts need only the standard library.",
		);
	}
	const [command, ...prefix] = python;
	return run(command, [...prefix, "-X", "utf8", script, ...args], cwd, signal);
}

export async function runChecker(options: CheckOptions): Promise<{ report: CheckReport; reportPath: string }> {
	const reportDir = options.reportDir ?? join(tmpdir(), "research2paper");
	mkdirSync(reportDir, { recursive: true });
	const reportPath = join(reportDir, `check-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.json`);

	const args = [options.input, "--json", reportPath];
	if (options.mode && options.mode !== "auto") args.push("--mode", options.mode);
	if (options.bib) args.push("--bib", options.bib);
	if (options.notes) args.push("--notes", options.notes);
	if (options.ledger) args.push("--ledger", options.ledger);
	if (options.abstractWords) args.push("--abstract-words", String(options.abstractWords));
	if (options.titleWords) args.push("--title-words", String(options.titleWords));
	if (options.final) args.push("--final");

	const result = await runPythonScript(CHECKER_SCRIPT, args, options.cwd, options.signal);
	// Exit 0 = clean, 1 = ERROR findings; anything else (2 = missing input) is a failed run.
	if (result.code !== 0 && result.code !== 1) {
		throw new Error(`check_paper_draft.py failed (exit ${result.code}): ${(result.stderr || result.stdout).trim()}`);
	}
	let report: CheckReport;
	try {
		report = JSON.parse(readFileSync(reportPath, "utf8")) as CheckReport;
	} catch {
		throw new Error(`check_paper_draft.py wrote no JSON report.\n${(result.stderr || result.stdout).trim()}`);
	}
	return { report, reportPath };
}

const LEVEL_ORDER = { ERROR: 0, WARN: 1, INFO: 2 } as const;
const MAX_ROWS = 60;

/** Model-facing summary: every ERROR, then WARNs, capped; INFO only as a count. */
export function formatReport(report: CheckReport, reportPath: string, final: boolean): string {
	const rows = report.findings
		.filter((f) => f.level !== "INFO")
		.sort((a, b) => LEVEL_ORDER[a.level] - LEVEL_ORDER[b.level] || a.code.localeCompare(b.code));
	const info = report.findings.length - rows.length;
	const lines = [
		`check_paper_draft: ${report.path} (${report.format}, ${report.mode} mode${final ? ", final" : ""})`,
		`Summary: ${report.errors} error(s), ${report.warnings} warning(s), ${info} info.`,
	];
	for (const f of rows.slice(0, MAX_ROWS)) lines.push(`${f.level} ${f.code} ${f.where}: ${f.message}`);
	if (rows.length > MAX_ROWS) lines.push(`... ${rows.length - MAX_ROWS} more; full report: ${reportPath}`);
	if (report.errors > 0) {
		lines.push("Fix every ERROR, then run check_draft again.");
	} else if (report.warnings > 0) {
		lines.push("No ERROR. For each WARN, fix it or state in the notes why it is a false alarm.");
	} else {
		lines.push("No ERROR or WARN. The checker cannot judge whether claims are true; apply the quality checklist.");
	}
	return lines.join("\n");
}
