/**
 * End-of-turn gate: before the agent settles, compile and check whatever manuscript files changed
 * since their last compile/check. Errors start an automatic fix round, at most MAX_AUTO_ROUNDS per
 * user input; after that the remaining problems are reported, not hidden.
 */

import { existsSync } from "node:fs";
import { dirname } from "node:path";
import { checkFile, compileProject } from "./actions.ts";
import type { PaperState } from "./state.ts";
import { latexProjectOf, loadPaperConfig } from "./workspace.ts";

export const MAX_AUTO_ROUNDS = 2;

export interface GateOutcome {
	/** Nothing was pending: no message, no continuation. */
	ran: boolean;
	needsFix: boolean;
	/** True when a fix round is started (needsFix and rounds left). */
	continue: boolean;
	text: string;
}

/** Files the checker should run on: the main .tex for anything in the LaTeX project or the notes, else the file itself. */
export function checkTargets(state: PaperState, cwd: string): string[] {
	const config = loadPaperConfig(cwd);
	const targets = new Set<string>();
	for (const file of state.unchecked) {
		const manuscript = config.manuscript && existsSync(config.manuscript) ? config.manuscript : undefined;
		if (manuscript && (file === config.notes || latexProjectOf(config, file))) targets.add(manuscript);
		else if (file !== config.notes && !file.endsWith(".bib") && existsSync(file)) targets.add(file);
	}
	return [...targets];
}

export async function runGate(state: PaperState, cwd: string, signal?: AbortSignal): Promise<GateOutcome> {
	const config = loadPaperConfig(cwd);
	const project = config.manuscript?.endsWith(".tex") ? dirname(config.manuscript) : undefined;
	const compile = project !== undefined && state.uncompiled.has(project);
	const targets = checkTargets(state, cwd);
	if (!compile && targets.length === 0) {
		state.unchecked.clear();
		return { ran: false, needsFix: false, continue: false, text: "" };
	}

	const parts: string[] = [];
	let needsFix = false;
	if (compile) {
		try {
			const outcome = await compileProject(state, cwd, config.manuscript, { signal });
			parts.push(outcome.text);
			needsFix ||= outcome.needsFix;
		} catch (error) {
			parts.push(`Compilation could not run: ${error instanceof Error ? error.message : String(error)}`);
		}
	}
	for (const target of targets) {
		try {
			const outcome = await checkFile(state, cwd, { path: target }, signal);
			parts.push(outcome.text);
			needsFix ||= outcome.report.errors > 0;
		} catch (error) {
			state.unchecked.delete(target);
			parts.push(`Check of ${target} could not run: ${error instanceof Error ? error.message : String(error)}`);
		}
	}

	const roundsLeft = state.autoRounds < MAX_AUTO_ROUNDS;
	const cont = needsFix && roundsLeft;
	if (cont) state.autoRounds += 1;
	const footer = !needsFix
		? "No blocking problems. Handle each WARN in the notes (fix it or say why it is a false alarm)."
		: cont
			? `Automatic fix round ${state.autoRounds} of ${MAX_AUTO_ROUNDS}: fix the errors above in the source files, then finish your reply; the checks run again. Do not tell the user the draft is clean while errors remain.`
			: `The ${MAX_AUTO_ROUNDS} automatic fix rounds for this request are used up; the errors above remain and need attention. They are not fixed.`;
	return {
		ran: true,
		needsFix,
		continue: cont,
		text: ["End-of-turn check by the paper agent.", ...parts, footer].join("\n\n"),
	};
}
