/**
 * Render PDF pages to PNG so a vision-capable model can look at figures, tables and layout.
 * Renderers: poppler's pdftoppm (ships with TeX Live and most Linux/macOS setups), MuPDF's
 * mutool, or Ghostscript. R2P_PDFTOPPM / R2P_MUTOOL / R2P_GS point at explicit executables.
 */

import { execFile } from "node:child_process";
import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { countPdfPages, which } from "./latex.ts";

export type RendererKind = "pdftoppm" | "mutool" | "ghostscript";

export interface Renderer {
	kind: RendererKind;
	command: string;
}

export function detectRenderer(): Renderer | undefined {
	const pdftoppm = process.env.R2P_PDFTOPPM || which("pdftoppm");
	if (pdftoppm) return { kind: "pdftoppm", command: pdftoppm };
	const mutool = process.env.R2P_MUTOOL || which("mutool");
	if (mutool) return { kind: "mutool", command: mutool };
	const gs = process.env.R2P_GS || which("gswin64c") || which("gs") || which("rungs");
	if (gs) return { kind: "ghostscript", command: gs };
	return undefined;
}

export const RENDERER_HELP =
	"No PDF renderer found: install poppler (pdftoppm; included in TeX Live), MuPDF (mutool) or Ghostscript, or set R2P_PDFTOPPM / R2P_MUTOOL / R2P_GS.";

/** "1-3,5" -> [1,2,3,5], clipped to the page count. */
export function parsePages(spec: string, pageCount: number): number[] {
	const pages = new Set<number>();
	for (const part of spec.split(",").map((p) => p.trim()).filter(Boolean)) {
		const m = part.match(/^(\d+)(?:\s*-\s*(\d+))?$/);
		if (!m) throw new Error(`Invalid page range "${part}"; use e.g. "1-3,5".`);
		const from = Number(m[1]);
		const to = m[2] ? Number(m[2]) : from;
		if (from < 1 || to < from) throw new Error(`Invalid page range "${part}".`);
		for (let p = from; p <= Math.min(to, pageCount); p++) pages.add(p);
	}
	if (pages.size === 0) throw new Error(`No pages in "${spec}" (the PDF has ${pageCount}).`);
	return [...pages].sort((a, b) => a - b);
}

export function rendererArgs(renderer: Renderer, pdf: string, page: number, width: number, outPrefix: string): string[] {
	if (renderer.kind === "pdftoppm") {
		return ["-png", "-f", String(page), "-l", String(page), "-scale-to", String(width), pdf, outPrefix];
	}
	if (renderer.kind === "mutool") return ["draw", "-o", `${outPrefix}-%d.png`, "-w", String(width), pdf, String(page)];
	// Ghostscript: DPI from the width, assuming a page about 8.5 in wide (letter/A4).
	const dpi = Math.max(36, Math.round(width / 8.5));
	return [
		"-dSAFER",
		"-dBATCH",
		"-dNOPAUSE",
		"-dQUIET",
		"-sDEVICE=png16m",
		`-r${dpi}`,
		`-dFirstPage=${page}`,
		`-dLastPage=${page}`,
		`-sOutputFile=${outPrefix}-%d.png`,
		pdf,
	];
}

function run(command: string, args: string[], signal?: AbortSignal) {
	return new Promise<void>((resolve, reject) => {
		execFile(command, args, { timeout: 60_000, signal, windowsHide: true }, (error, _stdout, stderr) => {
			if (error) reject(new Error(`${command} failed: ${String(stderr).trim() || error.message}`));
			else resolve();
		});
	});
}

export interface RenderedPage {
	page: number;
	png: Buffer;
}

/**
 * Page count: poppler's pdfinfo when installed (it reads compressed object streams), else a scan of
 * the PDF objects, which works for uncompressed page trees. undefined when neither can tell.
 */
export async function pdfPageCount(pdf: string, signal?: AbortSignal): Promise<number | undefined> {
	const pdfinfo = process.env.R2P_PDFINFO || which("pdfinfo");
	if (pdfinfo) {
		const out = await new Promise<string>((resolve) => {
			execFile(pdfinfo, [pdf], { timeout: 30_000, signal, windowsHide: true, encoding: "utf8" }, (error, stdout) =>
				resolve(error ? "" : stdout),
			);
		});
		const pages = out.match(/^Pages:\s+(\d+)/m)?.[1];
		if (pages) return Number(pages);
	}
	return countPdfPages(readFileSync(pdf));
}

export async function renderPages(
	renderer: Renderer,
	pdf: string,
	pages: number[],
	width: number,
	signal?: AbortSignal,
): Promise<RenderedPage[]> {
	const dir = mkdtempSync(join(tmpdir(), "r2p-pdf-"));
	try {
		const out: RenderedPage[] = [];
		for (const page of pages) {
			const prefix = join(dir, `p${page}`);
			try {
				await run(renderer.command, rendererArgs(renderer, pdf, page, width, prefix), signal);
			} catch (error) {
				// Past the last page (when the page count was unknown) renderers fail or write nothing.
				if (out.length > 0) break;
				throw error;
			}
			// pdftoppm pads the page number ("p3-03.png") depending on the page count; take what was written.
			const file = readdirSync(dir).find((name) => name.startsWith(`p${page}-`) && name.endsWith(".png"));
			if (!file) {
				if (out.length > 0) break;
				throw new Error(`${renderer.kind} wrote no image for page ${page}.`);
			}
			out.push({ page, png: readFileSync(join(dir, file)) });
		}
		return out;
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
}
