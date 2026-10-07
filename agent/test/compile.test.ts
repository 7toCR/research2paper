/**
 * Real LaTeX builds with whichever engine is installed (tectonic or latexmk). Skipped when neither is.
 */

import assert from "node:assert/strict";
import { existsSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { after, describe, test } from "node:test";
import { fauxAssistantMessage, fauxText, fauxToolCall } from "@earendil-works/pi-ai";
import { checkFile, compileProject } from "../src/actions.ts";
import { detectEngine } from "../src/latex.ts";
import { createState } from "../src/state.ts";
import { initWorkspace, LATEX_TEMPLATES } from "../src/workspace.ts";
import { messagesOf, startSession, tempRoot } from "./helpers.ts";

const engine = detectEngine();
const skip = engine ? false : "no LaTeX engine (tectonic or latexmk) installed";

describe(`LaTeX compile (${engine?.engine ?? "none"})`, { skip }, () => {
	const tmp = tempRoot("r2p-latex-");
	after(tmp.cleanup);

	for (const template of LATEX_TEMPLATES) {
		test(`the ${template} skeleton compiles and passes the checker without errors`, async () => {
			const { cwd } = tmp.dirs(template);
			initWorkspace(cwd, template);
			const state = createState();
			const compiled = await compileProject(state, cwd, undefined);
			assert.ok(compiled.result?.ok, compiled.text);
			assert.equal(compiled.needsFix, false, compiled.text);
			assert.ok(existsSync(join(cwd, "paper", "build", "main.pdf")));
			assert.ok((compiled.result?.pages ?? 0) >= 1, compiled.text);
			const checked = await checkFile(state, cwd, { path: "paper/main.tex" });
			assert.equal(checked.report.errors, 0, checked.text);
		});
	}

	test("errors are located by file and line; undefined citations and references are reported", async () => {
		const { cwd } = tmp.dirs("errors");
		initWorkspace(cwd, "article");
		const methods = join(cwd, "paper", "sections", "methods.tex");
		const state = createState();

		writeFileSync(methods, "\\section{Methods}\nThe filter \\undefinedmacro{} is applied.\n");
		const broken = await compileProject(state, cwd, undefined);
		assert.equal(broken.result?.ok, false);
		assert.ok(
			broken.result?.errors.some((e) => e.file === "sections/methods.tex" && e.line === 2),
			broken.text,
		);
		assert.match(broken.text, /FAILED/);

		writeFileSync(methods, "\\section{Methods}\nAs in \\cite{synthetic2020}, see Section~\\ref{sec:nowhere}.\n");
		const unresolved = await compileProject(state, cwd, undefined);
		assert.equal(unresolved.result?.ok, true, unresolved.text);
		assert.equal(unresolved.needsFix, true);
		assert.deepEqual(unresolved.result?.undefinedCitations, ["synthetic2020"]);
		assert.deepEqual(unresolved.result?.undefinedReferences, ["sec:nowhere"]);
		assert.match(unresolved.text, /Never invent a record/);
		assert.equal(state.lastCompile?.problems, 2);
	});

	const other = engine?.engine === "tectonic" ? "latexmk" : "tectonic";
	const bothInstalled = detectEngine(other)?.engine === other;
	test("a requested engine that is not installed is reported, not silently replaced", { skip: bothInstalled }, async () => {
		const { cwd } = tmp.dirs("fallback");
		initWorkspace(cwd, "article");
		const outcome = await compileProject(createState(), cwd, undefined, { engine: other });
		assert.match(outcome.text, new RegExp(`${other} is not installed; compiled with ${engine?.engine} instead`));
	});

	test("in a session: paper_init, then the end-of-turn gate compiles, checks and starts a fix round", async () => {
		const { cwd, agentDir } = tmp.dirs("session");
		const { session, faux } = await startSession(cwd, agentDir);
		try {
			// An empty folder is not a paper workspace yet; /paper on enables the paper tools.
			await session.prompt("/paper on");
			faux.setResponses([
				fauxAssistantMessage(fauxToolCall("paper_init", { template: "article", journal: "Synthetic Journal" }), {
					stopReason: "toolUse",
				}),
				fauxAssistantMessage(fauxText("Workspace ready.")),
			]);
			await session.prompt("Start a new paper");
			assert.ok(existsSync(join(cwd, "PAPER.md")));
			assert.ok(existsSync(join(cwd, "paper", "main.tex")));
			assert.equal(messagesOf(session.messages, (m) => m.customType === "r2p-gate").length, 0);

			faux.setResponses([
				fauxAssistantMessage(
					fauxToolCall("write", {
						path: "paper/sections/methods.tex",
						content: "\\section{Methods}\\label{sec:methods}\nWe follow \\cite{synthetic2020}.\n",
					}),
					{ stopReason: "toolUse" },
				),
				fauxAssistantMessage(fauxText("Methods drafted.")),
				(context) => {
					const last = JSON.stringify(context.messages.at(-1));
					// refs.bib is still empty, so the checker cannot verify keys; the compile catches the citation
					assert.match(last, /Undefined citations: synthetic2020/);
					assert.match(last, /fix round 1 of 2/);
					return fauxAssistantMessage(
						fauxToolCall("write", {
							path: "paper/sections/methods.tex",
							content:
								"\\section{Methods}\\label{sec:methods}\nWe follow [MISSING: source supporting this statement].\n",
						}),
						{ stopReason: "toolUse" },
					);
				},
				fauxAssistantMessage(fauxText("Replaced the unverified citation with a gap marker.")),
			]);
			await session.prompt("Draft the methods");
			assert.equal(faux.getPendingResponseCount(), 0);
			const gates = messagesOf(session.messages, (m) => m.customType === "r2p-gate");
			assert.equal(gates.length, 2);
			assert.match(gates[1], /Compiled paper\/main\.tex/);
			assert.match(gates[1], /0 error\(s\)/);
		} finally {
			session.dispose();
		}
	});
});
