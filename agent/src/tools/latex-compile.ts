import { defineTool } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { compileProject } from "../actions.ts";
import type { PaperState } from "../state.ts";

export function createLatexCompileTool(state: PaperState) {
	return defineTool({
		name: "latex_compile",
		label: "Compile LaTeX",
		description:
			"Compile a LaTeX manuscript to PDF with tectonic (preferred) or latexmk, shell escape disabled, output in build/ next to the main file. Returns errors with file and line, undefined references and citations, duplicate labels, missing files, overfull-box count, page count and the log path. Without a path it compiles the manuscript named in PAPER.md.",
		promptSnippet: "Compile the LaTeX manuscript to PDF and report errors, undefined references and citations",
		promptGuidelines: [
			"After changing LaTeX sources, make sure latex_compile succeeds without undefined references or citations before reporting; fix errors in the source, never by deleting content the paper needs.",
		],
		parameters: Type.Object({
			main: Type.Optional(Type.String({ description: "Main .tex file; default: the Manuscript in PAPER.md" })),
			engine: Type.Optional(
				Type.Union([Type.Literal("tectonic"), Type.Literal("latexmk")], {
					description: "Force an engine; default: tectonic when installed, else latexmk",
				}),
			),
		}),

		async execute(_toolCallId, params, signal, _onUpdate, ctx) {
			const outcome = await compileProject(state, ctx.cwd, params.main, { engine: params.engine, signal });
			return {
				content: [{ type: "text", text: outcome.text }],
				details: outcome.result,
				isError: outcome.result ? !outcome.result.ok : true,
			};
		},
	});
}
