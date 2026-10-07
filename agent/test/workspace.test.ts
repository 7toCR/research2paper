import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { checkFile } from "../src/actions.ts";
import { checkTargets } from "../src/gates.ts";
import { guardCommand, guardFileChange } from "../src/guard.ts";
import { engineArgs, needsUnicodeEngine, parseLatexLog } from "../src/latex.ts";
import { createState } from "../src/state.ts";
import { initWorkspace, loadPaperConfig, type PaperConfig, parsePaperFile } from "../src/workspace.ts";

function withTemp(prefix: string, body: (cwd: string) => void) {
	const cwd = mkdtempSync(join(tmpdir(), prefix));
	try {
		body(cwd);
	} finally {
		rmSync(cwd, { recursive: true, force: true });
	}
}

test("parseLatexLog: file:line errors, TeX errors with l.N, undefined refs/cites, labels, missing files", () => {
	const log = [
		"./sections/methods.tex:12: Undefined control sequence.",
		"! LaTeX Error: File `fig1.png' not found.",
		"",
		"l.40 \\includegraphics{fig1.png}",
		"LaTeX Warning: Reference `sec:x' on page 2 undefined on input line 7.",
		"LaTeX Warning: Reference `sec:x' on page 3 undefined on input line 9.",
		"Package natbib Warning: Citation `doe2020' on page 1 undefined on input line 3.",
		"LaTeX Warning: Label `fig:a' multiply defined.",
		"Overfull \\hbox (12.5pt too wide) in paragraph at lines 10--12",
		"Overfull \\hbox (0.3pt too wide) in paragraph at lines 20--21",
		"Output written on build/main.pdf (3 pages, 51234 bytes).",
	].join("\n");
	const blg = `Warning--I didn't find a database entry for "roe2021"\n`;
	const parsed = parseLatexLog(log, blg);
	assert.deepEqual(parsed.errors[0], { file: "sections/methods.tex", line: 12, message: "Undefined control sequence." });
	assert.deepEqual(parsed.errors[1], { line: 40, message: "LaTeX Error: File `fig1.png' not found." });
	assert.deepEqual(parsed.undefinedReferences, ["sec:x"]);
	assert.deepEqual(parsed.undefinedCitations, ["doe2020", "roe2021"]);
	assert.deepEqual(parsed.multiplyDefinedLabels, ["fig:a"]);
	assert.deepEqual(parsed.missingFiles, ["fig1.png"]);
	assert.equal(parsed.overfullBoxes, 1);
	assert.equal(parsed.pages, 3);
});

test("parseLatexLog: tectonic 0.17 errors — file without suffix, generic wrapper lines dropped, log duplicate merged", () => {
	// Captured from tectonic 0.17.0 on Windows with \input{sections/a} and an undefined macro on its line 2.
	const stderr = [
		"Fontconfig error: Cannot load default config file: No such file: (null)",
		"error: sections/a:2: Undefined control sequence",
		"error: something bad happened inside XeTeX; its output follows:",
		"error: the XeTeX engine had an unrecoverable error",
		"caused by: halted on potentially-recoverable error as specified",
	].join("\n");
	const log = "(sections/a\n! Undefined control sequence.\nl.2 \\undefinedmacro\n";
	const parsed = parseLatexLog(log, "I found no \\citation commands---while reading file main.aux", stderr);
	assert.deepEqual(parsed.errors, [{ file: "sections/a.tex", line: 2, message: "Undefined control sequence" }]);
	assert.match(parsed.notes.join(" "), /no \\cite commands yet/);
});

test("engineArgs: shell escape is never enabled; Unicode packages select xelatex", () => {
	assert.ok(engineArgs("tectonic", "main.tex", "build", false).includes("--untrusted"));
	const latexmk = engineArgs("latexmk", "main.tex", "build", false);
	assert.ok(latexmk.includes("-no-shell-escape") && latexmk.includes("-pdf"));
	assert.ok(engineArgs("latexmk", "main.tex", "build", true).includes("-xelatex"));
	assert.equal(needsUnicodeEngine("\\usepackage[UTF8]{ctex}"), true);
	assert.equal(needsUnicodeEngine("\\usepackage{amsmath}"), false);
});

test("parsePaperFile / loadPaperConfig: fields, backticks, limits and layout defaults", () => {
	withTemp("r2p-config-", (cwd) => {
		writeFileSync(
			join(cwd, "PAPER.md"),
			"- Journal: Synthetic Letters (SL)\n- Abstract word limit: 250 words\n- Title word limit:\n- Manuscript: `draft/main.tex`\n",
		);
		const fields = parsePaperFile(readFileSync(join(cwd, "PAPER.md"), "utf8"));
		assert.equal(fields.journal, "Synthetic Letters (SL)");
		assert.equal(fields["title word limit"], undefined);
		const config = loadPaperConfig(cwd);
		assert.equal(config.abstractWords, 250);
		assert.equal(config.titleWords, undefined);
		assert.equal(config.manuscript, join(cwd, "draft", "main.tex"));
		assert.equal(config.notes, undefined, "layout defaults apply only when the file exists");
		assert.equal(config.materials, join(cwd, "materials"));
	});
});

test("initWorkspace: creates the layout and never overwrites existing files", () => {
	withTemp("r2p-init-", (cwd) => {
		writeFileSync(join(cwd, "PAPER.md"), "mine");
		const first = initWorkspace(cwd, "elsarticle", "Synthetic Journal");
		assert.deepEqual(first.skipped, ["PAPER.md"]);
		assert.equal(readFileSync(join(cwd, "PAPER.md"), "utf8"), "mine");
		for (const rel of ["paper/main.tex", "paper/sections/methods.tex", "paper/refs.bib", "notes/memo.md", ".gitignore"]) {
			assert.ok(first.created.includes(rel), rel);
		}
		assert.match(readFileSync(join(cwd, "paper", "main.tex"), "utf8"), /elsarticle/);
		assert.ok(existsSync(join(cwd, "materials")));
		const second = initWorkspace(cwd, "article");
		assert.deepEqual(second.created, []);
		assert.match(readFileSync(join(cwd, "paper", "main.tex"), "utf8"), /elsarticle/);
	});
	withTemp("r2p-init-", (cwd) => {
		initWorkspace(cwd, "ieeetran", "Synthetic Transactions");
		const paper = readFileSync(join(cwd, "PAPER.md"), "utf8");
		assert.match(paper, /- Journal: Synthetic Transactions/);
		assert.match(paper, /- LaTeX template: ieeetran/);
	});
});

test("guardFileChange: materials and DR.Can.md blocked; workspace and agent files allowed; author files confirmed", () => {
	withTemp("r2p-guard-", (cwd) => {
		writeFileSync(join(cwd, "author.md"), "x");
		writeFileSync(join(cwd, "mine.md"), "x");
		const config = loadPaperConfig(cwd);
		const state = createState();
		state.agentFiles.add(join(cwd, "mine.md"));
		const decide = (path: string) => guardFileChange(cwd, config, state, "write", path).action;
		assert.equal(decide("materials/table.csv"), "block");
		assert.equal(decide("materials/sub/new.txt"), "block");
		assert.equal(decide("docs/DR.Can.md"), "block");
		assert.equal(decide("author.md"), "confirm");
		assert.equal(decide("mine.md"), "allow");
		assert.equal(decide("new-file.md"), "allow");
		assert.equal(decide("paper/sections/methods.tex"), "allow");
		assert.equal(decide("PAPER.md"), "allow");
	});
});

test("guardCommand: mutating commands on materials are flagged, reading them is not", () => {
	const cwd = join(tmpdir(), "ws");
	const config: PaperConfig = { materials: join(cwd, "materials") };
	const flag = (command: string) => guardCommand(cwd, config, command).action;
	assert.equal(flag("rm materials/results.csv"), "confirm");
	assert.equal(flag("mv materials/a.csv paper/a.csv"), "confirm");
	assert.equal(flag("echo x > materials/a.txt"), "confirm");
	assert.equal(flag("sed -i 's/a/b/' materials/notes.md"), "confirm");
	assert.equal(flag("Remove-Item .\\materials\\a.csv"), "confirm");
	assert.equal(flag("cat materials/results.csv"), "allow");
	assert.equal(flag("python analyze.py materials/results.csv > paper/table.tex"), "allow");
	assert.equal(flag("cp materials/fig1.png paper/figures/"), "allow");
	assert.equal(flag("rm paper/build/main.aux"), "allow");
});

test("checkFile: word limits come from PAPER.md for the manuscript it names", async () => {
	const cwd = mkdtempSync(join(tmpdir(), "r2p-limits-"));
	try {
		initWorkspace(cwd, "article");
		const paper = join(cwd, "PAPER.md");
		writeFileSync(paper, readFileSync(paper, "utf8").replace("- Abstract word limit:", "- Abstract word limit: 5"));
		writeFileSync(join(cwd, "paper", "sections", "abstract.tex"), "This synthetic abstract has clearly more than five words in it.\n");
		const outcome = await checkFile(createState(), cwd, { path: "paper/main.tex" });
		assert.ok(outcome.report.findings.some((f) => f.code === "S04" && f.level === "ERROR"), outcome.text);
	} finally {
		rmSync(cwd, { recursive: true, force: true });
	}
});

test("checkTargets: LaTeX sections and notes map to the main file; a .bib alone is not checked", () => {
	withTemp("r2p-targets-", (cwd) => {
		initWorkspace(cwd, "article");
		writeFileSync(join(cwd, "letter.md"), "# Response\n");
		const state = createState();
		for (const rel of ["paper/sections/methods.tex", "notes/memo.md", "letter.md", "paper/refs.bib"]) {
			state.unchecked.add(join(cwd, rel));
		}
		assert.deepEqual(checkTargets(state, cwd).sort(), [join(cwd, "letter.md"), join(cwd, "paper", "main.tex")].sort());
	});
});
