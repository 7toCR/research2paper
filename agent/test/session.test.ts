import assert from "node:assert/strict";
import { copyFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { after, describe, test } from "node:test";
import { fauxAssistantMessage, fauxText, fauxToolCall } from "@earendil-works/pi-ai";
import { FIXTURE, messagesOf, startSession, systemText, tempRoot } from "./helpers.ts";

describe("paper agent in a pi session", () => {
	const tmp = tempRoot("r2p-session-");
	after(tmp.cleanup);

	test("paper workspace: preamble replaced, PAPER.md injected, check_draft runs the checker", async () => {
		const { cwd, agentDir } = tmp.dirs("paper");
		writeFileSync(join(cwd, "PAPER.md"), "# Paper workspace\n\n- Journal: Synthetic Journal of Tests\n");
		copyFileSync(FIXTURE, join(cwd, "draft.md"));

		const { session, faux } = await startSession(cwd, agentDir);
		try {
			let prompt = "";
			faux.setResponses([
				(context) => {
					prompt = systemText(context.messages);
					return fauxAssistantMessage(fauxToolCall("check_draft", { path: "draft.md" }), { stopReason: "toolUse" });
				},
				fauxAssistantMessage(fauxText("Checked.")),
			]);
			await session.prompt("Check draft.md");

			assert.match(prompt, /You are Research2Paper/);
			assert.doesNotMatch(prompt, /expert coding assistant/);
			for (const tool of ["check_draft", "latex_compile", "paper_init", "fill_gaps"]) {
				assert.match(prompt, new RegExp(`- ${tool}: `));
			}
			assert.match(prompt, /Synthetic Journal of Tests/);
			assert.match(prompt, /<paper_state>/);
			assert.match(prompt, /<name>research2paper<\/name>/);

			const toolResult = session.messages.find((m) => m.role === "toolResult");
			assert.ok(toolResult, "expected a tool result");
			const text = JSON.stringify(toolResult);
			assert.match(text, /4 error\(s\)/);
			assert.match(text, /G01/);
			// nothing was written, so the end-of-turn gate stays silent
			assert.equal(messagesOf(session.messages, (m) => m.customType === "r2p-gate").length, 0);
		} finally {
			session.dispose();
		}
	});

	test("ordinary directory: pi prompt unchanged and paper tools not declared", async () => {
		const { cwd, agentDir } = tmp.dirs("code");
		const { session, faux } = await startSession(cwd, agentDir);
		try {
			let prompt = "";
			faux.setResponses([
				(context) => {
					prompt = systemText(context.messages);
					return fauxAssistantMessage(fauxText("ok"));
				},
			]);
			await session.prompt("hello");
			assert.match(prompt, /expert coding assistant/);
			assert.doesNotMatch(prompt, /You are Research2Paper/);
			assert.doesNotMatch(prompt, /<paper_state>/);
			assert.doesNotMatch(prompt, /- check_draft:|- latex_compile:/);
		} finally {
			session.dispose();
		}
	});

	test("paper_state reports the last check, including the end-of-turn check of a new file", async () => {
		const { cwd, agentDir } = tmp.dirs("state");
		writeFileSync(join(cwd, "PAPER.md"), "# Paper workspace\n");
		copyFileSync(FIXTURE, join(cwd, "draft.md"));
		const { session, faux } = await startSession(cwd, agentDir);
		try {
			faux.setResponses([
				fauxAssistantMessage(fauxToolCall("check_draft", { path: "draft.md" }), { stopReason: "toolUse" }),
				// <paper_state> is refreshed per user prompt; within a run the tool results carry the news.
				fauxAssistantMessage(fauxToolCall("write", { path: "draft-v2.md", content: "# Title\n\nRevised.\n" }), {
					stopReason: "toolUse",
				}),
				fauxAssistantMessage(fauxText("Revised.")),
			]);
			await session.prompt("Check and revise draft.md");

			let prompt = "";
			faux.setResponses([
				(context) => {
					prompt = systemText(context.messages);
					return fauxAssistantMessage(fauxText("ok"));
				},
			]);
			await session.prompt("status?");
			assert.match(prompt, /Last check: draft-v2\.md — 0 error\(s\)/);
			assert.doesNotMatch(prompt, /Changed since last check/);
		} finally {
			session.dispose();
		}
	});
});
