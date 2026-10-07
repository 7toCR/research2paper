import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, describe, test } from "node:test";
import { fauxAssistantMessage, fauxText, fauxToolCall } from "@earendil-works/pi-ai";
import {
	addEntries,
	emptyLedger,
	extractNumbers,
	ledgerSummary,
	loadLedger,
	removeEntries,
	saveLedger,
	updateEntry,
} from "../src/evidence.ts";
import { compare, describeComparison, exact, fmt, parseTable, readCell, resolveQuantities } from "../src/stats.ts";
import { initWorkspace } from "../src/workspace.ts";
import { messagesOf, startSession, tempRoot } from "./helpers.ts";

const CSV = "method,test_signals,correctly_denoised,criterion\nSWD,200,160,output SNR >= 20 dB\n\"Baseline B\",200,150,\"output SNR >= 20 dB\"\n";

function withTemp(body: (cwd: string) => void) {
	const cwd = mkdtempSync(join(tmpdir(), "r2p-ev-"));
	try {
		body(cwd);
	} finally {
		rmSync(cwd, { recursive: true, force: true });
	}
}

test("stats: rates, percentage points, relative change, ratio and count difference", () => {
	withTemp((cwd) => {
		writeFileSync(join(cwd, "r.csv"), CSV);
		const qs = resolveQuantities(cwd, [
			{ name: "SWD", value: { file: "r.csv", row: "swd", column: "correctly_denoised" }, of: { file: "r.csv", row: "SWD", column: "test_signals" } },
			{ name: "B", value: { file: "r.csv", row: "Baseline B", column: "correctly_denoised" }, of: 200 },
		]);
		assert.equal(qs[0].rate, 80);
		assert.equal(qs[1].rate, 75);
		assert.deepEqual(qs[0].cells, ["r.csv: swd / correctly_denoised", "r.csv: SWD / test_signals"]);
		const c = compare(qs, "SWD", "B");
		assert.equal(c.difference, 5);
		assert.equal(c.differenceUnit, "percentage points");
		assert.equal(c.countDifference, 10);
		assert.equal(fmt(c.relativeChange ?? 0, 2), "6.67");
		assert.equal(
			describeComparison(c, 2),
			"SWD vs B: difference +5 percentage points; count difference +10; relative change +6.67%; ratio 1.067",
		);
		assert.equal(exact(c.relativeChange ?? 0), "6.66666666667");
	});
});

test("stats: helpful errors for unknown rows/columns, non-numbers, unit mismatch and zero denominators", () => {
	withTemp((cwd) => {
		writeFileSync(join(cwd, "r.csv"), CSV);
		assert.throws(() => readCell(cwd, { file: "r.csv", row: "SWD", column: "accuracy" }), /Columns: method, test_signals/);
		assert.throws(() => readCell(cwd, { file: "r.csv", row: "C", column: "test_signals" }), /Rows: SWD, Baseline B/);
		assert.throws(() => readCell(cwd, { file: "r.csv", row: "SWD", column: "criterion" }), /is not a number/);
		const qs = resolveQuantities(cwd, [
			{ name: "latency", value: 12, unit: "ms" },
			{ name: "gain", value: 3, unit: "dB" },
		]);
		assert.throws(() => compare(qs, "latency", "gain"), /different units/);
		assert.throws(() => resolveQuantities(cwd, [{ name: "x", value: 1, of: 0 }]), /denominator is 0/);
		assert.deepEqual(parseTable('a,"b, c"\n1,2\n', ","), [["a", "b, c"], ["1", "2"]]);
	});
});

test("ledger: ids, extracted numbers, derived-from checks, update and guarded removal", () => {
	const ledger = emptyLedger();
	const [a, b] = addEntries(ledger, [
		{ claim: "SWD met the criterion for 160 of 200 signals", class: "verified", source: "materials/results.csv" },
		{ claim: "Window length is 256 samples", class: "author-reported", source: "materials/method-notes.md" },
	]);
	assert.equal(a.id, "E1");
	assert.deepEqual(a.numbers, ["160", "200"]);
	assert.throws(() => addEntries(ledger, [{ claim: "x 1", class: "verified", source: " " }]), /needs a source/);
	assert.throws(
		() => addEntries(ledger, [{ claim: "d", class: "verified", source: "computed", derivedFrom: ["E9"] }]),
		/E9, which is not in the ledger/,
	);
	const [c] = addEntries(ledger, [{ claim: "rate 80%", class: "verified", source: "computed", derivedFrom: ["E1"] }]);
	assert.throws(() => removeEntries(ledger, ["E1"]), /E3 are derived from them/);
	updateEntry(ledger, b.id, { claim: "Window length is 512 samples" });
	assert.deepEqual(ledger.entries[1].numbers, ["512"]);
	removeEntries(ledger, [c.id]);
	assert.equal(ledgerSummary(ledger), "2 entries (1 verified, 1 author-reported)");
	assert.deepEqual(extractNumbers("1,234.5 units and 3.11 and 3.11"), ["1,234.5", "3.11"]);
	withTemp((cwd) => {
		saveLedger(join(cwd, "notes", "evidence.json"), ledger);
		assert.equal(loadLedger(join(cwd, "notes", "evidence.json")).entries.length, 2);
		assert.equal(loadLedger(join(cwd, "absent.json")).entries.length, 0);
	});
});

describe("evidence workflow in a session", () => {
	const tmp = tempRoot("r2p-evidence-");
	after(tmp.cleanup);

	test("compute_stats reads cells and records sources; the gate reports numbers missing from the ledger", async () => {
		const { cwd, agentDir } = tmp.dirs("flow");
		initWorkspace(cwd, "article");
		writeFileSync(join(cwd, "materials", "results.csv"), CSV);
		const { session, faux } = await startSession(cwd, agentDir);
		try {
			const cell = (row: string, column: string) => ({ file: "materials/results.csv", row, column });
			faux.setResponses([
				fauxAssistantMessage(
					[
						fauxToolCall("compute_stats", {
							quantities: [
								{ name: "SWD", value: cell("SWD", "correctly_denoised"), of: cell("SWD", "test_signals") },
								{ name: "Baseline B", value: cell("Baseline B", "correctly_denoised"), of: cell("Baseline B", "test_signals") },
							],
							compare: [{ a: "SWD", b: "Baseline B" }],
						}),
						fauxToolCall("evidence", {
							action: "add",
							entries: [{ claim: "Windows of 256 samples", class: "author-reported", source: "materials/method-notes.md" }],
						}),
					],
					{ stopReason: "toolUse" },
				),
				fauxAssistantMessage(
					fauxToolCall("write", {
						path: "paper/sections/results.tex",
						content:
							"\\section{Results and Discussion}\\label{sec:results}\nSWD met the criterion for 160 of 200 signals (80\\%), Baseline B for 150 (75\\%): 5 percentage points, a relative increase of 6.67\\%. Windows had 256 samples; runtime was 42.5 ms.\n",
					}),
					{ stopReason: "toolUse" },
				),
				fauxAssistantMessage(fauxText("Results drafted.")),
			]);
			await session.prompt("Write the results");

			const ledger = loadLedger(join(cwd, "notes", "evidence.json"));
			assert.deepEqual(
				ledger.entries.map((e) => [e.id, e.class]),
				[["E1", "verified"], ["E2", "verified"], ["E3", "verified"], ["E4", "author-reported"]],
			);
			assert.deepEqual(ledger.entries[2].derivedFrom, ["E1", "E2"]);
			assert.match(ledger.entries[0].source, /materials\/results\.csv: SWD \/ correctly_denoised/);

			const gates = messagesOf(session.messages, (m) => m.customType === "r2p-gate");
			assert.equal(gates.length, 1);
			// only the unrecorded runtime is reported; WARN alone starts no fix round
			assert.match(gates[0], /V01[^\n]*'42\.5' is not in the evidence ledger/);
			assert.doesNotMatch(gates[0], /'(?:160|200|80|150|75|6\.67|256)' is not in/);
			assert.match(gates[0], /No blocking problems/);
			assert.equal(faux.getPendingResponseCount(), 0);
			assert.match(readFileSync(join(cwd, "notes", "evidence.json"), "utf8"), /"formula"/);
		} finally {
			session.dispose();
		}
	});
});
