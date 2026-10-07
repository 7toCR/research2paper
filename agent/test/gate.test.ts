import assert from "node:assert/strict";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { after, describe, test } from "node:test";
import { fauxAssistantMessage, fauxText, fauxToolCall } from "@earendil-works/pi-ai";
import { initWorkspace } from "../src/workspace.ts";
import { messagesOf, startSession, tempRoot } from "./helpers.ts";

const BROKEN = "# Synthetic Title\n\nThe stride is [MISSING].\n";
const FIXED = "# Synthetic Title\n\nThe stride is [MISSING: stride of the sliding window].\n";

const write = (path: string, content: string) =>
	fauxAssistantMessage(fauxToolCall("write", { path, content }), { stopReason: "toolUse" });

describe("end-of-turn gate", () => {
	const tmp = tempRoot("r2p-gate-");
	after(tmp.cleanup);

	test("an ERROR starts a fix round; a clean re-check ends the turn", async () => {
		const { cwd, agentDir } = tmp.dirs("fix");
		writeFileSync(join(cwd, "PAPER.md"), "# Paper workspace\n");
		const { session, faux } = await startSession(cwd, agentDir);
		try {
			faux.setResponses([
				write("draft.md", BROKEN),
				fauxAssistantMessage(fauxText("Drafted.")),
				(context) => {
					const last = JSON.stringify(context.messages.at(-1));
					assert.match(last, /End-of-turn check/);
					assert.match(last, /G01/);
					assert.match(last, /fix round 1 of 2/);
					return write("draft.md", FIXED);
				},
				fauxAssistantMessage(fauxText("Fixed the marker.")),
			]);
			await session.prompt("Draft the methods paragraph");

			assert.equal(faux.getPendingResponseCount(), 0);
			const gates = messagesOf(session.messages, (m) => m.customType === "r2p-gate");
			assert.equal(gates.length, 2);
			assert.match(gates[0], /1 error\(s\)/);
			assert.match(gates[1], /0 error\(s\)/);
			assert.match(gates[1], /No blocking problems/);
			assert.equal(readFileSync(join(cwd, "draft.md"), "utf8"), FIXED);
		} finally {
			session.dispose();
		}
	});

	test("fix rounds are capped at two per user input, then the errors are reported as remaining", async () => {
		const { cwd, agentDir } = tmp.dirs("cap");
		writeFileSync(join(cwd, "PAPER.md"), "# Paper workspace\n");
		const { session, faux } = await startSession(cwd, agentDir);
		try {
			faux.setResponses([
				write("draft.md", BROKEN),
				fauxAssistantMessage(fauxText("v1")),
				write("draft.md", BROKEN),
				fauxAssistantMessage(fauxText("v2")),
				write("draft.md", BROKEN),
				fauxAssistantMessage(fauxText("v3")),
				fauxAssistantMessage(fauxText("must not be requested")),
			]);
			await session.prompt("Draft it");
			assert.equal(faux.getPendingResponseCount(), 1, "the gate must stop after two fix rounds");
			const gates = messagesOf(session.messages, (m) => m.customType === "r2p-gate");
			assert.equal(gates.length, 3);
			assert.match(gates[2], /are used up/);

			// a new user input resets the budget
			faux.setResponses([write("draft.md", FIXED), fauxAssistantMessage(fauxText("ok"))]);
			await session.prompt("Try again");
			assert.equal(faux.getPendingResponseCount(), 0);
		} finally {
			session.dispose();
		}
	});
});

describe("fill_gaps", () => {
	const tmp = tempRoot("r2p-fill-");
	after(tmp.cleanup);

	test("fills markers in the LaTeX sections in place and removes their 材料缺口 lines from the notes", async () => {
		const { cwd, agentDir } = tmp.dirs("fill");
		initWorkspace(cwd, "article");
		const methods = join(cwd, "paper", "sections", "methods.tex");
		writeFileSync(methods, "\\section{Methods}\nThe window stride is [MISSING: stride of the sliding window].\n");
		const memo = join(cwd, "notes", "memo.md");
		writeFileSync(
			memo,
			"# 中文说明\n\n## 材料缺口\n\n- `[MISSING: stride of the sliding window]`：请提供滑窗步长。\n- `[MISSING: title]`：题目最后确定。\n",
		);
		const { session, faux } = await startSession(cwd, agentDir);
		try {
			faux.setResponses([
				fauxAssistantMessage(
					fauxToolCall("fill_gaps", { values: { "[MISSING: stride of the sliding window]": "16 samples" } }),
					{ stopReason: "toolUse" },
				),
				fauxAssistantMessage(fauxText("Filled.")),
			]);
			await session.prompt("The stride is 16 samples");
			assert.equal(readFileSync(methods, "utf8"), "\\section{Methods}\nThe window stride is 16 samples.\n");
			const notes = readFileSync(memo, "utf8");
			assert.doesNotMatch(notes, /stride of the sliding window/);
			assert.match(notes, /\[MISSING: title\]/);
			assert.ok(!existsSync(join(cwd, "paper", "sections", "methods.filled.tex")), "workspace drafts are filled in place");
			// the filled manuscript goes through the end-of-turn gate
			assert.equal(messagesOf(session.messages, (m) => m.customType === "r2p-gate").length, 1);
		} finally {
			session.dispose();
		}
	});
});

describe("write guard", () => {
	const tmp = tempRoot("r2p-guard-");
	after(tmp.cleanup);

	test("materials are read-only; author files outside the workspace are not overwritten without confirmation", async () => {
		const { cwd, agentDir } = tmp.dirs("guard");
		writeFileSync(join(cwd, "PAPER.md"), "# Paper workspace\n");
		mkdirSync(join(cwd, "materials"));
		writeFileSync(join(cwd, "materials", "results.csv"), "method,correct\nA,160\n");
		writeFileSync(join(cwd, "intro.md"), "# Introduction\n\nAuthor text.\n");
		const { session, faux } = await startSession(cwd, agentDir);
		try {
			faux.setResponses([
				fauxAssistantMessage(
					[
						fauxToolCall("write", { path: "materials/results.csv", content: "tampered" }),
						fauxToolCall("bash", { command: "rm materials/results.csv" }),
						fauxToolCall("edit", { path: "intro.md", edits: [{ oldText: "Author text.", newText: "New text." }] }),
						fauxToolCall("write", { path: "intro.revised.md", content: "# Introduction\n\nNew text.\n" }),
					],
					{ stopReason: "toolUse" },
				),
				fauxAssistantMessage(fauxText("Done.")),
			]);
			await session.prompt("Revise the introduction");

			const results = session.messages.filter((m) => m.role === "toolResult").map((m) => JSON.stringify(m));
			assert.equal(results.length, 4);
			assert.match(results[0], /read-only/);
			assert.match(results[1], /may modify materials\//);
			assert.match(results[2], /may be the author's original/);
			assert.doesNotMatch(results[3], /"isError":true/);

			assert.equal(readFileSync(join(cwd, "materials", "results.csv"), "utf8"), "method,correct\nA,160\n");
			assert.equal(readFileSync(join(cwd, "intro.md"), "utf8"), "# Introduction\n\nAuthor text.\n");
			assert.ok(existsSync(join(cwd, "intro.revised.md")));
		} finally {
			session.dispose();
		}
	});
});
