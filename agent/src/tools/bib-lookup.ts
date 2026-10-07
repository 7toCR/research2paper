import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { defineTool } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { checkEntries, type FetchLike, formatBibResults, parseBib } from "../bib.ts";
import { REPORTS_DIR } from "../paths.ts";
import { isPaperWorkspace } from "../state.ts";
import { loadPaperConfig } from "../workspace.ts";

const MAX_ENTRIES = 60;

/** fetchFn is injectable for tests; the default is the global fetch, which pi routes through its proxy settings. */
export function createBibLookupTool(fetchFn: FetchLike = fetch) {
	return defineTool({
		name: "bib_lookup",
		label: "Check bibliography",
		description:
			"Check .bib entries against Crossref: for an entry with a DOI, whether the DOI is registered and whether title, year and first author match the record; for an entry without a DOI, list close Crossref records as leads. Read-only: it never edits the .bib. A matching record does not show that the work supports the sentence citing it. Needs network access to api.crossref.org.",
		promptSnippet: "Check .bib entries against Crossref records (DOI exists, title/year/first author match)",
		promptGuidelines: [
			"Use bib_lookup before delivery when the paper has references; put every difference, unregistered DOI, entry without DOI and failed lookup under 待核验事项. Never add a reference, or a DOI from the possible records, that the author has not confirmed.",
		],
		executionMode: "sequential",
		parameters: Type.Object({
			bib: Type.Optional(Type.String({ description: "BibTeX file; default: Bibliography in PAPER.md" })),
			keys: Type.Optional(Type.Array(Type.String(), { description: "Only these citation keys; default: all entries" })),
			search: Type.Optional(
				Type.Boolean({ description: "Search Crossref by title for entries without a DOI; default true" }),
			),
		}),

		async execute(_toolCallId, params, signal, _onUpdate, ctx) {
			const path = params.bib ? resolve(ctx.cwd, params.bib) : loadPaperConfig(ctx.cwd).bibliography;
			if (!path || !existsSync(path)) {
				throw new Error("No .bib file: pass bib, or set 'Bibliography:' in PAPER.md.");
			}
			let entries = parseBib(readFileSync(path, "utf8"));
			if (params.keys?.length) {
				const unknown = params.keys.filter((k) => !entries.some((e) => e.key === k));
				if (unknown.length) throw new Error(`Not in ${params.bib ?? "the .bib"}: ${unknown.join(", ")}.`);
				entries = entries.filter((e) => params.keys?.includes(e.key));
			}
			if (entries.length === 0) {
				return { content: [{ type: "text", text: "The .bib file has no entries to check." }], details: { results: [] } };
			}
			const skipped = entries.length > MAX_ENTRIES ? entries.length - MAX_ENTRIES : 0;
			const results = await checkEntries(entries.slice(0, MAX_ENTRIES), {
				fetchFn,
				search: params.search ?? true,
				signal,
			});
			let text = formatBibResults(results);
			if (skipped) text += `\n${skipped} more entries were not checked; call again with keys.`;
			if (isPaperWorkspace(ctx.cwd)) {
				const dir = join(ctx.cwd, REPORTS_DIR);
				mkdirSync(dir, { recursive: true });
				const report = join(dir, `bib-${Date.now()}.json`);
				writeFileSync(report, `${JSON.stringify({ bib: path, results }, null, 2)}\n`);
			}
			return { content: [{ type: "text", text }], details: { results } };
		},
	});
}
