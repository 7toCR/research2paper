/**
 * Test harness: the extension loaded by pi exactly as `pi -e agent/src/index.ts` would load it,
 * driven by pi's scripted faux model. No network, no API keys.
 */

import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fauxProvider, getSystemMessageText, type Message, type SystemMessage } from "@earendil-works/pi-ai";
import {
	createAgentSession,
	DefaultResourceLoader,
	ModelRegistry,
	ModelRuntime,
	SessionManager,
	SettingsManager,
} from "@earendil-works/pi-coding-agent";
import { PACKAGE_ROOT } from "../src/paths.ts";

export const EXTENSION = join(PACKAGE_ROOT, "agent", "src", "index.ts");
export const FIXTURE = join(PACKAGE_ROOT, "tests", "fixtures", "flawed_manuscript.md");

/** Every system message the model received, rendered: the initial prompt plus later section updates. */
export function systemText(messages: Message[]): string {
	return messages
		.filter((m): m is SystemMessage => m.role === "system")
		.map((m) => getSystemMessageText(m))
		.join("\n");
}

export async function startSession(cwd: string, agentDir: string) {
	const faux = fauxProvider();
	const modelRuntime = await ModelRuntime.create({
		authPath: join(agentDir, "auth.json"),
		modelsPath: null,
		allowModelNetwork: false,
		refreshOnCreate: false,
	});
	new ModelRegistry(modelRuntime).registerProvider(faux.provider);
	const settingsManager = SettingsManager.inMemory();
	const resourceLoader = new DefaultResourceLoader({
		cwd,
		agentDir,
		settingsManager,
		additionalExtensionPaths: [EXTENSION],
		additionalSkillPaths: [join(PACKAGE_ROOT, "skills")],
		noContextFiles: true,
	});
	await resourceLoader.reload();
	const { session } = await createAgentSession({
		cwd,
		agentDir,
		model: faux.getModel(),
		thinkingLevel: "off",
		modelRuntime,
		resourceLoader,
		sessionManager: SessionManager.inMemory(cwd),
		settingsManager,
	});
	await session.bindExtensions({});
	return { session, faux };
}

/** A temp root with one fresh working directory and agent directory per test. */
export function tempRoot(prefix: string) {
	const root = mkdtempSync(join(tmpdir(), prefix));
	return {
		root,
		dirs(name: string) {
			const cwd = join(root, name, "work");
			const agentDir = join(root, name, "agent");
			mkdirSync(cwd, { recursive: true });
			mkdirSync(agentDir, { recursive: true });
			return { cwd, agentDir };
		},
		cleanup: () => rmSync(root, { recursive: true, force: true }),
	};
}

/** Text of every message of a given role/customType, as JSON, for loose assertions. */
export function messagesOf(messages: readonly unknown[], predicate: (m: Record<string, unknown>) => boolean): string[] {
	return messages.filter((m) => predicate(m as Record<string, unknown>)).map((m) => JSON.stringify(m));
}
