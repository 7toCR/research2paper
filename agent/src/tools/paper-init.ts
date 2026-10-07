import { defineTool } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { initWorkspace, LAYOUT } from "../workspace.ts";

export function formatInit(result: ReturnType<typeof initWorkspace>): string {
	const lines = [`Created: ${result.created.join(", ") || "nothing"}.`];
	if (result.skipped.length) lines.push(`Kept existing (not overwritten): ${result.skipped.join(", ")}.`);
	lines.push(
		`Layout: author material in ${LAYOUT.materials}/ (read-only), manuscript ${LAYOUT.manuscript} with sections/*.tex and ${LAYOUT.bibliography}, figures in ${LAYOUT.paper}/figures/, Chinese notes in ${LAYOUT.notes}, PDF in ${LAYOUT.paper}/build/.`,
	);
	return lines.join("\n");
}

export const paperInitTool = defineTool({
	name: "paper_init",
	label: "Create paper workspace",
	description:
		"Create a paper workspace in the working directory: PAPER.md, materials/ for the author's files, a LaTeX skeleton (paper/main.tex, paper/sections/*.tex, paper/refs.bib, paper/figures/), notes/memo.md for the Chinese notes and a .gitignore. Existing files are never overwritten. Templates: article (generic), elsarticle (Elsevier), ieeetran (IEEE). Use it when the user starts a new paper and no PAPER.md exists; for a publisher-specific template the user supplies, start from article and adapt.",
	promptSnippet: "Create the paper workspace and LaTeX skeleton (article, elsarticle or ieeetran)",
	parameters: Type.Object({
		template: Type.Optional(
			Type.Union([Type.Literal("article"), Type.Literal("elsarticle"), Type.Literal("ieeetran")], {
				description: "LaTeX skeleton; default article",
			}),
		),
		journal: Type.Optional(Type.String({ description: "Target journal, recorded in PAPER.md" })),
	}),

	async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
		const result = initWorkspace(ctx.cwd, params.template ?? "article", params.journal);
		return { content: [{ type: "text", text: formatInit(result) }], details: result };
	},
});
