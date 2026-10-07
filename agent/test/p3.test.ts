/**
 * P3: bibliography check (Crossref mocked, synthetic DOIs), PDF preview (real renderer, skipped
 * when none is installed) and the `paper` launcher.
 */

import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, describe, test } from "node:test";
import type { ExtensionToolContext } from "@earendil-works/pi-coding-agent";
import { compileProject } from "../src/actions.ts";
import {
	checkEntries,
	compareEntry,
	type CrossrefWork,
	type FetchLike,
	firstAuthorFamily,
	formatBibResults,
	normalizeDoi,
	parseBib,
	plain,
	titleSimilarity,
} from "../src/bib.ts";
import { detectEngine } from "../src/latex.ts";
import { PACKAGE_ROOT } from "../src/paths.ts";
import { detectRenderer, parsePages, rendererArgs } from "../src/pdf.ts";
import { createState } from "../src/state.ts";
import { createBibLookupTool } from "../src/tools/bib-lookup.ts";
import { pdfPreviewTool } from "../src/tools/pdf-preview.ts";
import { initWorkspace } from "../src/workspace.ts";

const BIB = `% synthetic entries only
@comment{ignored, not an entry}
@article{doe2020,
  author = {Doe, Ann and Roe, Rick},
  title = {A {Synthetic} Study of Sliding-Window Denoising},
  journal = "Journal of Synthetic Signals",
  year = 2020,
  doi = {https://doi.org/10.0000/SYNTHETIC.1}
}
@article{roe2019,
  author = {Rick Roe},
  title = {Global Thresholding for Synthetic Signals},
  year = {2019},
  doi = {10.0000/synthetic.2}
}
@inproceedings{lee2021, author = {Lee, Kim}, title = {Unregistered Synthetic Work}, year = {2021}, doi = {10.0000/missing}}
@misc{nodoi2022, author = {Poe, Pat}, title = {Wavelet Denoising of Synthetic Vibration Data}, year = {2022}}
@misc{broken2023, title = {Network Failure Example}, doi = {10.0000/fail}}
`;

const WORKS: Record<string, CrossrefWork> = {
	"10.0000/synthetic.1": {
		DOI: "10.0000/synthetic.1",
		title: ["A synthetic study of sliding-window denoising"],
		author: [{ family: "Doe", given: "Ann" }],
		// online first in December 2020, in print 2021: the .bib's 2020 is right
		issued: { "date-parts": [[2021, 1]] },
		"published-online": { "date-parts": [[2020, 12, 3]] },
	},
	"10.0000/synthetic.2": {
		DOI: "10.0000/synthetic.2",
		title: ["Global thresholding for synthetic signals"],
		author: [{ family: "Roe", given: "Rick" }],
		issued: { "date-parts": [[2015]] },
	},
};

const calls: string[] = [];
const mockFetch: FetchLike = async (url) => {
	calls.push(url);
	const json = (body: unknown) => ({ status: 200, ok: true, json: async () => body });
	if (url.includes("/works/")) {
		const doi = decodeURIComponent(url.split("/works/")[1]);
		if (doi === "10.0000/fail") throw new Error("connect ETIMEDOUT");
		const work = WORKS[doi];
		return work ? json({ message: work }) : { status: 404, ok: false, json: async () => ({}) };
	}
	return json({
		message: {
			items: [
				{ DOI: "10.0000/synthetic.3", title: ["Wavelet denoising of synthetic vibration data"], author: [{ family: "Poe" }], issued: { "date-parts": [[2022]] } },
				{ DOI: "10.0000/synthetic.4", title: ["Unrelated synthetic topic"], issued: { "date-parts": [[2010]] } },
			],
		},
	});
};

function toolCtx(cwd: string) {
	return { cwd } as unknown as ExtensionToolContext;
}

test("parseBib: braces, quotes, bare values, comments; helpers normalise names, titles and DOIs", () => {
	const entries = parseBib(BIB);
	assert.deepEqual(entries.map((e) => e.key), ["doe2020", "roe2019", "lee2021", "nodoi2022", "broken2023"]);
	assert.equal(entries[0].fields.title, "A {Synthetic} Study of Sliding-Window Denoising");
	assert.equal(entries[0].fields.journal, "Journal of Synthetic Signals");
	assert.equal(entries[0].fields.year, "2020");
	assert.equal(normalizeDoi(entries[0].fields.doi), "10.0000/synthetic.1");
	assert.equal(firstAuthorFamily("Doe, Ann and Roe, Rick"), "doe");
	assert.equal(firstAuthorFamily("Rick Roe and Ann Doe"), "roe");
	assert.equal(plain("M\\\"{u}ller's {GPU} \\emph{Study}"), "muller s gpu study");
	assert.equal(titleSimilarity("A {Synthetic} Study", "a synthetic study"), 1);
});

test("compareEntry: any dated year (online or print) passes; other years and first authors are reported", () => {
	const [doe, roe] = parseBib(BIB);
	assert.deepEqual(compareEntry(doe, WORKS["10.0000/synthetic.1"]), []);
	assert.deepEqual(compareEntry(roe, WORKS["10.0000/synthetic.2"]), ["year 2019 vs Crossref 2015"]);
	// one year off is still a difference when no date of the record has that year (found in a live check)
	const offByOne = { ...WORKS["10.0000/synthetic.2"], issued: { "date-parts": [[2020]] } };
	assert.deepEqual(compareEntry(roe, offByOne), ["year 2019 vs Crossref 2020"]);
	const other = { ...WORKS["10.0000/synthetic.1"], author: [{ family: "Smith" }] };
	assert.match(compareEntry(doe, other).join(), /first author "doe" vs Crossref "smith"/);
});

test("checkEntries: every status, without network", async () => {
	calls.length = 0;
	const results = await checkEntries(parseBib(BIB), { fetchFn: mockFetch, search: true });
	assert.deepEqual(
		results.map((r) => [r.key, r.status]),
		[
			["doe2020", "record-matches"],
			["roe2019", "fields-differ"],
			["lee2021", "doi-not-found"],
			["nodoi2022", "no-doi"],
			["broken2023", "lookup-failed"],
		],
	);
	assert.equal(results[3].candidates[0].doi, "10.0000/synthetic.3");
	const text = formatBibResults(results);
	assert.match(text, /Checked 5 entries: /);
	assert.match(text, /nodoi2022: no DOI; possible records: doi:10\.0000\/synthetic\.3/);
	assert.doesNotMatch(text, /synthetic\.4/, "low-overlap search hits are not offered");
	assert.match(text, /does not show the work supports the sentence/);
	assert.ok(calls.every((url) => url.startsWith("https://api.crossref.org/")));
});

test("bib_lookup tool: reads the PAPER.md bibliography, never edits it, writes a report", async () => {
	const cwd = mkdtempSync(join(tmpdir(), "r2p-bib-"));
	try {
		initWorkspace(cwd, "article");
		const bibPath = join(cwd, "paper", "refs.bib");
		writeFileSync(bibPath, BIB);
		const tool = createBibLookupTool(mockFetch);
		const result = await tool.execute("t1", { keys: ["doe2020", "nodoi2022"], search: true }, undefined, undefined, toolCtx(cwd));
		const text = result.content.map((c) => (c.type === "text" ? c.text : "")).join("\n");
		assert.match(text, /Checked 2 entries: 1 record-matches, 1 no-doi/);
		assert.equal(readFileSync(bibPath, "utf8"), BIB, "the .bib is never edited, not even with the possible records");
		assert.equal(readdirSync(join(cwd, ".r2p", "reports")).filter((f) => f.startsWith("bib-")).length, 1);
		await assert.rejects(
			tool.execute("t2", { keys: ["nope"] }, undefined, undefined, toolCtx(cwd)),
			/Not in the \.bib: nope/,
		);
	} finally {
		rmSync(cwd, { recursive: true, force: true });
	}
});

test("parsePages and renderer arguments", () => {
	assert.deepEqual(parsePages("1-3,5", 4), [1, 2, 3]);
	assert.deepEqual(parsePages("2, 1", 4), [1, 2]);
	assert.throws(() => parsePages("x", 4), /Invalid page range/);
	assert.throws(() => parsePages("7-9", 4), /No pages/);
	assert.deepEqual(rendererArgs({ kind: "pdftoppm", command: "pdftoppm" }, "a.pdf", 2, 1400, "out"), [
		"-png", "-f", "2", "-l", "2", "-scale-to", "1400", "a.pdf", "out",
	]);
	assert.ok(rendererArgs({ kind: "ghostscript", command: "gs" }, "a.pdf", 1, 1400, "out").includes("-dSAFER"));
});

const renderer = detectRenderer();
const engine = detectEngine();
describe(`pdf_preview (${renderer?.kind ?? "no renderer"})`, { skip: !renderer || !engine ? "needs a PDF renderer and a LaTeX engine" : false }, () => {
	const root = mkdtempSync(join(tmpdir(), "r2p-pdf-"));
	after(() => rmSync(root, { recursive: true, force: true }));

	test("renders pages of the compiled manuscript as PNG images", async () => {
		initWorkspace(root, "article");
		const compiled = await compileProject(createState(), root, undefined);
		assert.ok(compiled.result?.ok, compiled.text);
		const result = await pdfPreviewTool.execute("t", { pages: "1-5", width: 600 }, undefined, undefined, toolCtx(root));
		const images = result.content.filter((c) => c.type === "image");
		const details = result.details as { total?: number; pages: number[] };
		assert.ok(details.total && details.total >= 1, "pdfinfo or the object scan reads the page count");
		assert.equal(images.length, Math.min(details.total ?? 0, 5));
		assert.deepEqual(details.pages, Array.from({ length: images.length }, (_, i) => i + 1));
		const png = Buffer.from(images[0].type === "image" ? images[0].data : "", "base64");
		assert.deepEqual([...png.subarray(0, 4)], [0x89, 0x50, 0x4e, 0x47]);
		assert.match(result.content[0].type === "text" ? result.content[0].text : "", /paper\/build\/main\.pdf: \d+ page\(s\)/);
	});

	test("a missing PDF asks for a compile first", async () => {
		await assert.rejects(
			pdfPreviewTool.execute("t", { pdf: "nope.pdf" }, undefined, undefined, toolCtx(root)),
			/does not exist; compile first/,
		);
	});
});

test("paper launcher: pi with the extension, in paper mode", () => {
	const agentDir = mkdtempSync(join(tmpdir(), "r2p-launcher-"));
	try {
		const out = execFileSync(process.execPath, [join(PACKAGE_ROOT, "agent", "bin", "paper.mjs"), "--help"], {
			env: { ...process.env, PI_CODING_AGENT_DIR: agentDir, PI_OFFLINE: "1" },
			encoding: "utf8",
			timeout: 120_000,
		});
		assert.match(out, /--paper\s+Start in Research2Paper paper mode/);
		assert.ok(existsSync(join(PACKAGE_ROOT, "agent", "src", "index.ts")));
	} finally {
		rmSync(agentDir, { recursive: true, force: true });
	}
});
