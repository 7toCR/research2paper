import { existsSync } from "node:fs";
import { basename, dirname, join, relative, resolve } from "node:path";
import { PAPER_FILE, STATE_DIR, toPosix } from "./paths.ts";
import type { PaperState } from "./state.ts";
import { isInside, LAYOUT, type PaperConfig } from "./workspace.ts";

export type GuardDecision = { action: "allow" } | { action: "block"; reason: string } | { action: "confirm"; reason: string };

const ALLOW: GuardDecision = { action: "allow" };

/** Folders and files the agent owns: its drafts, notes, state and the workspace config. */
function agentAreas(cwd: string, config: PaperConfig): string[] {
	const areas = [join(cwd, LAYOUT.paper), join(cwd, "notes"), join(cwd, STATE_DIR), join(cwd, PAPER_FILE)];
	if (config.manuscript?.endsWith(".tex")) areas.push(dirname(config.manuscript));
	if (config.notes) areas.push(config.notes);
	return areas;
}

/**
 * Decide on a write/edit to `path` in paper mode:
 * - the materials folder and DR.Can.md source notes are read-only;
 * - an existing file outside the agent's areas may be the author's original, so overwriting it
 *   needs the author's confirmation (blocked when no one can be asked);
 * - everything else is allowed.
 */
export function guardFileChange(
	cwd: string,
	config: PaperConfig,
	state: PaperState,
	tool: "write" | "edit",
	path: string,
): GuardDecision {
	const abs = resolve(cwd, path);
	const rel = toPosix(relative(cwd, abs)) || abs;
	if (isInside(config.materials, abs)) {
		return {
			action: "block",
			reason: `${rel} is in the materials folder, which holds the author's original material and is read-only. Write derived files to ${LAYOUT.paper}/ or notes/ instead.`,
		};
	}
	if (/^dr\.can\.md$/i.test(basename(abs))) {
		return { action: "block", reason: `${rel} is the DR_CAN source note set and is read-only.` };
	}
	if (!existsSync(abs) || state.agentFiles.has(abs) || agentAreas(cwd, config).some((area) => isInside(area, abs))) {
		return ALLOW;
	}
	return {
		action: "confirm",
		reason: `${tool === "write" ? "Overwrite" : "Edit"} ${rel}? It is outside the paper workspace and may be the author's original; revisions normally go to a new file.`,
	};
}

/** Shell commands that would delete, move or overwrite something in the materials folder. */
const MUTATING = /(?:\brm\b|\brmdir\b|\bmv\b|\bsed\s+-i|\btruncate\b|\bshred\b|Remove-Item|Move-Item|Rename-Item|Set-Content|Add-Content|Clear-Content|Out-File|\bdel\b|\berase\b|\bren\b)/i;

export function guardCommand(cwd: string, config: PaperConfig, command: string): GuardDecision {
	const folder = toPosix(relative(cwd, config.materials)) || "materials";
	const escaped = folder.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
	const mentions = new RegExp(`(?:^|[\\s"'=/\\\\])${escaped}(?:[\\\\/]|\\b)`, "i");
	const redirectInto = new RegExp(`>>?\\s*["']?[^\\s|;&]*${escaped}[\\\\/]`, "i");
	const segments = command.split(/&&|\|\||;|\|/);
	const mutates = segments.some((segment) => MUTATING.test(segment) && mentions.test(segment)) || redirectInto.test(command);
	if (!mutates) return ALLOW;
	return {
		action: "confirm",
		reason: `The command may modify ${folder}/, which holds the author's original material and is read-only for the agent.`,
	};
}
