import { defineTool } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { checkFile } from "../actions.ts";
import type { CheckReport } from "../checker.ts";
import type { PaperState } from "../state.ts";

export interface CheckDraftDetails {
	path: string;
	reportPath: string;
	final: boolean;
	errors: number;
	warnings: number;
	findings: CheckReport["findings"];
}

export function createCheckDraftTool(state: PaperState) {
	return defineTool({
		name: "check_draft",
		label: "Check draft",
		description:
			"Run the Research2Paper checker (check_paper_draft.py) on a manuscript, section or reviewer-response letter (.md, .tex including its \\input files, .docx, .txt). Reports gap markers, figure/table/equation cross-references, citations against the reference list or .bib, acronyms, unsupported claim wording, percentage-point errors, Abstract/Conclusion numbers missing from the body, audit-log text inside the paper, and response-letter completion claims. For the manuscript named in PAPER.md, the notes file and the word limits written in PAPER.md are applied (there is no other way to set a limit); when the workspace has an evidence ledger, numbers not recorded in it are reported as V01. It cannot judge whether a claim is true.",
		promptSnippet: "Run the Research2Paper draft checker on a manuscript or response letter",
		promptGuidelines: [
			"Run check_draft on every manuscript or response-letter file you write or revise, before reporting to the user; for a LaTeX paper check the main .tex file, which includes the section files.",
			"Use check_draft with final=true only for a pre-submission check: every remaining [MISSING: ...] marker is then an ERROR.",
			"Word limits are read from PAPER.md ('Abstract word limit', 'Title word limit') for the manuscript it names. When the user or the journal's guidelines give a limit, write it into PAPER.md; never invent one.",
		],
		parameters: Type.Object({
			path: Type.String({ description: "Draft or response letter to check, relative to the working directory" }),
			bib: Type.Optional(Type.String({ description: "BibTeX file, when \\bibliography in the .tex does not name it" })),
			notes: Type.Optional(
				Type.String({ description: "Separate file with the Chinese gap notes, when they are not in the draft" }),
			),
			ledger: Type.Optional(
				Type.String({ description: "Evidence ledger JSON; default: the workspace ledger (notes/evidence.json) when it exists" }),
			),
			mode: Type.Optional(
				Type.Union([Type.Literal("auto"), Type.Literal("manuscript"), Type.Literal("section"), Type.Literal("response")], {
					description: "auto (default) detects a full manuscript, a single section or a response letter",
				}),
			),
			final: Type.Optional(Type.Boolean({ description: "Submission stage: any remaining gap marker is an ERROR" })),
			// No word-limit parameters: models with strict tool schemas filled them with invented limits
			// (seen in real runs). Limits come from PAPER.md, where their source is visible.
		}),

		async execute(_toolCallId, params, signal, _onUpdate, ctx) {
			const outcome = await checkFile(state, ctx.cwd, params, signal);
			return {
				content: [{ type: "text", text: outcome.text }],
				details: {
					path: outcome.path,
					reportPath: outcome.reportPath,
					final: outcome.final,
					errors: outcome.report.errors,
					warnings: outcome.report.warnings,
					findings: outcome.report.findings,
				} satisfies CheckDraftDetails,
			};
		},
	});
}
