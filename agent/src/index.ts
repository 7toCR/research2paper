/**
 * Research2Paper paper agent: a pi extension.
 *
 * Paper mode replaces pi's coding preamble with the paper-agent prompt, injects PAPER.md and a
 * <paper_state> section, enables the paper tools, guards the author's material and runs the
 * end-of-turn compile/check gate. It is on when the working directory holds PAPER.md or .r2p/,
 * when pi starts with --paper, or after /paper on; otherwise pi is unchanged.
 */

import { existsSync, readFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import {
	type ExtensionAPI,
	type ExtensionContext,
	isEditToolResult,
	isToolCallEventType,
	isWriteToolResult,
} from "@earendil-works/pi-coding-agent";
import { checkFile, compileProject } from "./actions.ts";
import { findPython } from "./checker.ts";
import { ledgerSummary, loadLedger } from "./evidence.ts";
import { runGate } from "./gates.ts";
import { type GuardDecision, guardCommand, guardFileChange } from "./guard.ts";
import { detectEngine, ENGINE_HELP } from "./latex.ts";
import { PAPER_FILE, toPosix } from "./paths.ts";
import { buildPreamble, buildStateSection } from "./prompt.ts";
import { createState, isManuscriptFile, LATEX_SOURCE_EXT, resolveMode } from "./state.ts";
import { createCheckDraftTool } from "./tools/check-draft.ts";
import { createBibLookupTool } from "./tools/bib-lookup.ts";
import { computeStatsTool } from "./tools/compute-stats.ts";
import { evidenceTool } from "./tools/evidence.ts";
import { createFillGapsTool } from "./tools/fill-gaps.ts";
import { createLatexCompileTool } from "./tools/latex-compile.ts";
import { formatInit, paperInitTool } from "./tools/paper-init.ts";
import { pdfPreviewTool } from "./tools/pdf-preview.ts";
import { initWorkspace, isInside, LATEX_TEMPLATES, type LatexTemplate, loadPaperConfig } from "./workspace.ts";

const MODE_ENTRY = "r2p-mode";
const GATE_MESSAGE = "r2p-gate";
const STATUS_KEY = "research2paper";
const PAPER_TOOLS = [
	"check_draft",
	"latex_compile",
	"paper_init",
	"fill_gaps",
	"evidence",
	"compute_stats",
	"bib_lookup",
	"pdf_preview",
];
const COMMANDS = ["on", "off", "status", "init", "check", "compile", "final"];

export default function research2paper(pi: ExtensionAPI) {
	const state = createState();

	pi.registerFlag("paper", { type: "boolean", default: false, description: "Start in Research2Paper paper mode" });
	pi.registerTool(createCheckDraftTool(state));
	pi.registerTool(createLatexCompileTool(state));
	pi.registerTool(paperInitTool);
	pi.registerTool(createFillGapsTool(state));
	pi.registerTool(evidenceTool);
	pi.registerTool(computeStatsTool);
	pi.registerTool(createBibLookupTool());
	pi.registerTool(pdfPreviewTool);

	const mode = (ctx: ExtensionContext) => resolveMode(state, pi.getFlag("paper") === true, ctx.cwd);

	const updateStatus = (ctx: ExtensionContext) => {
		if (!mode(ctx).active) {
			ctx.ui.setStatus(STATUS_KEY, undefined);
			return;
		}
		const check = state.lastCheck ? `${state.lastCheck.errors}E ${state.lastCheck.warnings}W` : "not run";
		const pdf = state.lastCompile ? (state.lastCompile.ok ? "pdf ok" : "pdf failed") : "";
		const pending = state.unchecked.size + state.uncompiled.size;
		ctx.ui.setStatus(
			STATUS_KEY,
			["paper", `check ${check}`, pdf, pending ? `${pending} pending` : ""].filter(Boolean).join(" · "),
		);
	};

	pi.on("session_start", async (_event, ctx) => {
		// /paper on|off is stored on the branch so resume and fork keep it.
		state.override = undefined;
		for (const entry of ctx.sessionManager.getBranch()) {
			if (entry.type === "custom" && entry.customType === MODE_ENTRY) {
				state.override = (entry.data as { active?: boolean } | undefined)?.active;
			}
		}
		updateStatus(ctx);
		if (!mode(ctx).active) return;
		if (!(await findPython())) {
			ctx.ui.notify("Research2Paper: Python 3 not found; draft checks will fail until it is installed.", "warning");
		}
		if (!detectEngine()) ctx.ui.notify(`Research2Paper: ${ENGINE_HELP}`, "warning");
	});

	pi.on("input", () => {
		state.autoRounds = 0;
	});

	pi.on("before_agent_start", (event, ctx) => {
		const options = event.systemPromptOptions;
		const { active, source } = mode(ctx);
		if (!active) {
			options.selectedTools = options.selectedTools.filter((name) => !PAPER_TOOLS.includes(name));
			return;
		}
		for (const name of PAPER_TOOLS) if (!options.selectedTools.includes(name)) options.selectedTools.push(name);
		options.customPrompt = buildPreamble(options);
		const paperFile = join(ctx.cwd, PAPER_FILE);
		if (existsSync(paperFile) && !options.contextFiles.some((file) => resolve(file.path) === paperFile)) {
			options.contextFiles.push({ path: paperFile, content: readFileSync(paperFile, "utf8") });
		}
		const evidence = loadPaperConfig(ctx.cwd).evidence;
		let ledger: string | undefined;
		if (evidence && existsSync(evidence)) {
			try {
				ledger = `${toPosix(relative(ctx.cwd, evidence))}, ${ledgerSummary(loadLedger(evidence))}`;
			} catch (error) {
				ledger = `${toPosix(relative(ctx.cwd, evidence))} is not valid JSON (${error instanceof Error ? error.message : String(error)}); repair it`;
			}
		}
		options.sections.paper_state = buildStateSection(state, ctx.cwd, source, ledger);
	});

	pi.on("tool_call", async (event, ctx) => {
		if (!mode(ctx).active) return;
		const config = loadPaperConfig(ctx.cwd);
		let decision: GuardDecision;
		let created: string | undefined;
		if (isToolCallEventType("write", event) || isToolCallEventType("edit", event)) {
			decision = guardFileChange(ctx.cwd, config, state, event.toolName, event.input.path);
			const abs = resolve(ctx.cwd, event.input.path);
			if (event.toolName === "write" && !existsSync(abs)) created = abs;
		} else if (isToolCallEventType("bash", event) || isToolCallEventType("powershell", event)) {
			decision = guardCommand(ctx.cwd, config, event.input.command);
		} else {
			return;
		}
		if (decision.action === "allow") {
			if (created) state.agentFiles.add(created);
			return;
		}
		if (decision.action === "confirm" && ctx.hasUI && (await ctx.ui.confirm("Research2Paper", decision.reason))) {
			return;
		}
		const why =
			decision.action === "block"
				? decision.reason
				: `${decision.reason} ${ctx.hasUI ? "The author declined." : "No one can confirm this here."} Write the revision to a new file instead.`;
		return { block: true, reason: why };
	});

	pi.on("tool_result", (event, ctx) => {
		if (event.isError || !(isWriteToolResult(event) || isEditToolResult(event))) return;
		const path = event.input.path;
		if (typeof path !== "string") return;
		const abs = resolve(ctx.cwd, path);
		const config = loadPaperConfig(ctx.cwd);
		const project = config.manuscript?.endsWith(".tex") ? dirname(config.manuscript) : undefined;
		if (project && isInside(join(project, "build"), abs)) return;
		if (abs === config.notes || isManuscriptFile(ctx.cwd, abs)) state.unchecked.add(abs);
		if (project && isInside(project, abs) && LATEX_SOURCE_EXT.test(abs)) state.uncompiled.add(project);
		updateStatus(ctx);
	});

	pi.on("agent_before_settle", async (event, ctx) => {
		if (event.outcome !== "completed" || !mode(ctx).active) return;
		const gate = await runGate(state, ctx.cwd, ctx.signal);
		updateStatus(ctx);
		if (!gate.ran) return;
		return {
			entries: [
				{
					type: "custom_message",
					customType: GATE_MESSAGE,
					content: gate.text,
					display: true,
					details: { needsFix: gate.needsFix, round: state.autoRounds },
				},
			],
			continue: gate.continue,
		};
	});

	pi.on("agent_end", (_event, ctx) => updateStatus(ctx));

	pi.registerCommand("paper", {
		description: "Research2Paper: /paper on | off | status | init [article|elsarticle|ieeetran] | check | compile | final",
		getArgumentCompletions: (prefix) =>
			COMMANDS.filter((value) => value.startsWith(prefix.trim())).map((value) => ({ value, label: value })),
		handler: async (args, ctx) => {
			const [action = "status", arg] = args.trim().split(/\s+/).filter(Boolean);
			const config = loadPaperConfig(ctx.cwd);
			const rel = (p: string) => toPosix(relative(ctx.cwd, p)) || p;
			try {
				if (action === "on" || action === "off") {
					state.override = action === "on";
					pi.appendEntry(MODE_ENTRY, { active: state.override });
					ctx.ui.notify(`Paper mode ${action}.`, "info");
				} else if (action === "init") {
					const template = (arg ?? "article").toLowerCase() as LatexTemplate;
					if (!LATEX_TEMPLATES.includes(template)) {
						ctx.ui.notify(`Unknown template '${arg}'. Use: ${LATEX_TEMPLATES.join(", ")}.`, "warning");
						return;
					}
					ctx.ui.notify(formatInit(initWorkspace(ctx.cwd, template)), "info");
				} else if (action === "check" || action === "final") {
					if (!config.manuscript || !existsSync(config.manuscript)) {
						ctx.ui.notify("No manuscript: set 'Manuscript:' in PAPER.md.", "warning");
						return;
					}
					const outcome = await checkFile(state, ctx.cwd, { path: config.manuscript, final: action === "final" });
					ctx.ui.notify(outcome.text, outcome.report.errors ? "warning" : "info");
				} else if (action === "compile") {
					const outcome = await compileProject(state, ctx.cwd, undefined);
					ctx.ui.notify(outcome.text, outcome.needsFix ? "warning" : "info");
				} else if (action === "status") {
					const { active, source } = mode(ctx);
					const lines = [
						`Paper mode: ${active ? `on (${source})` : "off"}`,
						`Manuscript: ${config.manuscript ? rel(config.manuscript) : "not set"}`,
						`LaTeX engine: ${detectEngine()?.engine ?? "none"}`,
						state.lastCheck
							? `Last check: ${rel(state.lastCheck.path)} — ${state.lastCheck.errors} error(s), ${state.lastCheck.warnings} warning(s)`
							: "Last check: none",
						state.lastCompile
							? `Last compile: ${state.lastCompile.ok ? "ok" : "failed"}, ${state.lastCompile.problems} problem(s)`
							: "Last compile: none",
					];
					ctx.ui.notify(lines.join("\n"), "info");
				} else {
					ctx.ui.notify(`Usage: /paper ${COMMANDS.join(" | ")}`, "warning");
					return;
				}
			} catch (error) {
				ctx.ui.notify(`Research2Paper: ${error instanceof Error ? error.message : String(error)}`, "error");
			}
			updateStatus(ctx);
		},
	});
}
