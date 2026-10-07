import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { type CheckReport, formatReport } from "../src/checker.ts";
import { buildPreamble } from "../src/prompt.ts";
import { createState, isManuscriptFile, resolveMode } from "../src/state.ts";

test("resolveMode: /paper beats --paper beats workspace detection", () => {
	const cwd = mkdtempSync(join(tmpdir(), "r2p-mode-"));
	try {
		const state = createState();
		assert.deepEqual(resolveMode(state, false, cwd), { active: false, source: undefined });
		assert.deepEqual(resolveMode(state, true, cwd), { active: true, source: "flag" });
		writeFileSync(join(cwd, "PAPER.md"), "");
		assert.deepEqual(resolveMode(state, false, cwd), { active: true, source: "workspace" });
		state.override = false;
		assert.deepEqual(resolveMode(state, true, cwd), { active: false, source: "command" });
	} finally {
		rmSync(cwd, { recursive: true, force: true });
	}
});

test("resolveMode: a .r2p directory also marks a paper workspace", () => {
	const cwd = mkdtempSync(join(tmpdir(), "r2p-mode-"));
	try {
		mkdirSync(join(cwd, ".r2p"));
		assert.equal(resolveMode(createState(), false, cwd).active, true);
	} finally {
		rmSync(cwd, { recursive: true, force: true });
	}
});

test("isManuscriptFile: drafts and bibliographies yes; agent state, PAPER.md and figures no", () => {
	const cwd = join(tmpdir(), "ws");
	assert.equal(isManuscriptFile(cwd, "paper/sections/methods.tex"), true);
	assert.equal(isManuscriptFile(cwd, "draft.md"), true);
	assert.equal(isManuscriptFile(cwd, "refs.bib"), true);
	assert.equal(isManuscriptFile(cwd, ".r2p/notes.md"), false);
	assert.equal(isManuscriptFile(cwd, "PAPER.md"), false);
	assert.equal(isManuscriptFile(cwd, "figures/fig1.png"), false);
});

test("buildPreamble: lists declared tools only and de-duplicates guidelines", () => {
	const text = buildPreamble({
		selectedTools: ["read", "check_draft", "hidden_tool"],
		hiddenTools: ["hidden_tool"],
		toolSnippets: { read: "Read files", check_draft: "Check drafts", hidden_tool: "Secret" },
		toolGuidelines: { read: ["Use read."], check_draft: ["Run check_draft."], hidden_tool: ["Hidden rule."] },
		promptGuidelines: ["Use read."],
	});
	assert.match(text, /- read: Read files\n- check_draft: Check drafts/);
	assert.doesNotMatch(text, /Secret|Hidden rule/);
	assert.equal(text.match(/- Use read\./g)?.length, 1);
	assert.match(text, /skills\/research2paper\/SKILL\.md/);
});

function finding(level: "ERROR" | "WARN" | "INFO", code: string) {
	return { level, code, where: "line 1", message: `${code} message` };
}

test("formatReport: ERRORs first, INFO only counted, rows capped with a pointer to the full report", () => {
	const report: CheckReport = {
		path: "draft.md",
		format: "md",
		mode: "manuscript",
		errors: 1,
		warnings: 70,
		findings: [
			...Array.from({ length: 70 }, () => finding("WARN", "W01")),
			finding("ERROR", "G01"),
			finding("INFO", "S04"),
		],
	};
	const text = formatReport(report, "/tmp/report.json", false);
	const lines = text.split("\n");
	assert.equal(lines[1], "Summary: 1 error(s), 70 warning(s), 1 info.");
	assert.match(lines[2], /^ERROR G01 /);
	assert.doesNotMatch(text, /S04/);
	assert.match(text, /\.\.\. 11 more; full report: \/tmp\/report\.json/);
	assert.match(text, /Fix every ERROR/);
});

test("formatReport: final stage is labelled and a clean report says what the checker cannot judge", () => {
	const report: CheckReport = { path: "d.md", format: "md", mode: "section", errors: 0, warnings: 0, findings: [] };
	const text = formatReport(report, "r.json", true);
	assert.match(text, /section mode, final\)/);
	assert.match(text, /cannot judge whether claims are true/);
});
