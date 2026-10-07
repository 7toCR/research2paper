import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve } from "node:path";
import { defineTool } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { runPythonScript } from "../checker.ts";
import { FILL_GAPS_SCRIPT, toPosix } from "../paths.ts";
import type { PaperState } from "../state.ts";
import { isInside, LAYOUT, loadPaperConfig } from "../workspace.ts";

function texFiles(dir: string): string[] {
	const out: string[] = [];
	for (const name of readdirSync(dir)) {
		const path = join(dir, name);
		if (name === "build") continue;
		if (statSync(path).isDirectory()) out.push(...texFiles(path));
		else if (name.endsWith(".tex")) out.push(path);
	}
	return out;
}

export function createFillGapsTool(state: PaperState) {
	return defineTool({
		name: "fill_gaps",
		label: "Fill gaps",
		description:
			"Replace [MISSING: ...] markers with information the author supplied, using the skill's fill_gaps.py: exact marker matching, and lines in the 材料缺口 notes that quote a filled marker are removed. Default files: every .tex file of the LaTeX manuscript plus the notes file from PAPER.md, edited in place (they are the agent's working drafts). Other files get a <name>.filled<ext> copy unless inPlace is true.",
		promptSnippet: "Fill [MISSING: ...] markers with author-supplied values across the manuscript and notes",
		promptGuidelines: [
			"Use fill_gaps only with values the author actually supplied; afterwards re-read every sentence that contains a new value and anything that depends on it (Abstract numbers, captions, Limitations).",
		],
		parameters: Type.Object({
			values: Type.Record(Type.String(), Type.String(), {
				description: 'Map from marker (full "[MISSING: ...]" or its inner text) to the author-supplied value',
			}),
			files: Type.Optional(Type.Array(Type.String(), { description: "Files to fill; default: manuscript .tex files and notes" })),
			inPlace: Type.Optional(Type.Boolean({ description: "Overwrite files outside paper/ and notes/ (only when the author agreed)" })),
		}),

		async execute(_toolCallId, params, signal, _onUpdate, ctx) {
			const config = loadPaperConfig(ctx.cwd);
			let files = (params.files ?? []).map((f) => resolve(ctx.cwd, f));
			if (files.length === 0) {
				if (config.manuscript?.endsWith(".tex") && existsSync(config.manuscript)) {
					files = texFiles(dirname(config.manuscript));
				} else if (config.manuscript && existsSync(config.manuscript)) {
					files = [config.manuscript];
				}
				if (config.notes && existsSync(config.notes)) files.push(config.notes);
			}
			if (files.length === 0) throw new Error("No files to fill: pass files, or set Manuscript in PAPER.md.");

			// The agent's own drafts: the workspace folders, the LaTeX project and the notes file.
			// A Markdown manuscript may be the author's original, so it gets a .filled copy.
			const workAreas = [join(ctx.cwd, LAYOUT.paper), join(ctx.cwd, "notes")];
			if (config.manuscript?.endsWith(".tex")) workAreas.push(dirname(config.manuscript));
			if (config.notes) workAreas.push(config.notes);
			// The notes file only loses lines of markers that really occur in the manuscript files,
			// so a mistyped marker cannot erase a gap from the notes.
			const notesFile = config.notes && files.includes(config.notes) ? config.notes : undefined;
			const body = files
				.filter((f) => f !== notesFile && existsSync(f))
				.map((f) => readFileSync(f, "utf8"))
				.join("\n");
			const occurs = (marker: string) => {
				const inner = marker.replace(/^\[MISSING\s*[:：]\s*/i, "").replace(/\]$/, "").replace(/\s+/g, " ").trim();
				return [...body.matchAll(/\[MISSING\s*[:：]\s*([^\]]*)\]/gi)].some((m) => m[1].replace(/\s+/g, " ").trim() === inner);
			};
			const notesValues = Object.fromEntries(Object.entries(params.values).filter(([marker]) => occurs(marker)));

			const tmp = mkdtempSync(join(tmpdir(), "r2p-fill-"));
			const valuesFile = join(tmp, "values.json");
			const notesValuesFile = join(tmp, "notes-values.json");
			writeFileSync(valuesFile, JSON.stringify(params.values));
			writeFileSync(notesValuesFile, JSON.stringify(notesValues));
			const report: string[] = [];
			try {
				for (const file of files) {
					if (!existsSync(file)) {
						report.push(`${toPosix(relative(ctx.cwd, file))}: not found`);
						continue;
					}
					const inPlace = params.inPlace || workAreas.some((dir) => isInside(dir, file));
					const values = file === notesFile ? notesValuesFile : valuesFile;
					const args = [file, values, ...(inPlace ? ["--in-place"] : [])];
					const result = await runPythonScript(FILL_GAPS_SCRIPT, args, ctx.cwd, signal);
					if (result.code !== 0) throw new Error(`fill_gaps.py failed on ${file}: ${result.stderr || result.stdout}`);
					const first = result.stdout.split(/\r?\n/)[0] ?? "";
					report.push(`${toPosix(relative(ctx.cwd, file))}: ${first}`);
					const filledMatch = first.match(/-> (.+)$/);
					const output = filledMatch ? resolve(ctx.cwd, filledMatch[1].trim()) : file;
					state.unchecked.add(config.manuscript && isInside(dirname(config.manuscript), output) ? config.manuscript : output);
					if (config.manuscript?.endsWith(".tex") && isInside(dirname(config.manuscript), output)) {
						state.uncompiled.add(dirname(config.manuscript));
					}
				}
			} finally {
				rmSync(tmp, { recursive: true, force: true });
			}
			report.push(
				"Markers that matched no value stay open. Re-read each filled sentence and what depends on it; the end-of-turn check will run on the manuscript.",
			);
			return { content: [{ type: "text", text: report.join("\n") }], details: { files } };
		},
	});
}
