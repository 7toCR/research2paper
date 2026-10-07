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
			"Run the Research2Paper checker (check_paper_draft.py) on a manuscript, section or reviewer-response letter (.md, .tex including its \\input files, .docx, .txt). Reports gap markers, figure/table/equation cross-references, citations against the reference list or .bib, acronyms, unsupported claim wording, percentage-point errors, Abstract/Conclusion numbers missing from the body, audit-log text inside the paper, and response-letter completion claims. For the manuscript named in PAPER.md, the notes file and word limits from PAPER.md are used by default. It cannot judge whether a claim is true.",
		promptSnippet: "Run the Research2Paper draft checker on a manuscript or response letter",
		promptGuidelines: [
			"Run check_draft on every manuscript or response-letter file you write or revise, before reporting to the user; for a LaTeX paper check the main .tex file, which includes the section files.",
			"Use check_draft with final=true only for a pre-submission check: every remaining [MISSING: ...] marker is then an ERROR.",
			"Pass abstractWords/titleWords only from PAPER.md, the journal's guidelines or the user; never invent a limit. For the PAPER.md manuscript, the limits there are applied automatically.",
		],
		parameters: Type.Object({
			path: Type.String({ description: "Draft or response letter to check, relative to the working directory" }),
			bib: Type.Optional(Type.String({ description: "BibTeX file, when \\bibliography in the .tex does not name it" })),
			notes: Type.Optional(
				Type.String({ description: "Separate file with the Chinese gap notes, when they are not in the draft" }),
			),
			mode: Type.Optional(
				Type.Union([Type.Literal("auto"), Type.Literal("manuscript"), Type.Literal("section"), Type.Literal("response")], {
					description: "auto (default) detects a full manuscript, a single section or a response letter",
				}),
			),
			final: Type.Optional(Type.Boolean({ description: "Submission stage: any remaining gap marker is an ERROR" })),
			abstractWords: Type.Optional(Type.Integer({ minimum: 1, description: "Abstract word limit from the journal" })),
			titleWords: Type.Optional(Type.Integer({ minimum: 1, description: "Title word limit from the journal" })),
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
