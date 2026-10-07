#!/usr/bin/env node
/**
 * `paper`: pi with the Research2Paper extension, started in paper mode.
 *
 * Same arguments as `pi` (models, -p, --continue, ...). Package and auth commands (paper install,
 * paper auth ...) are passed to pi unchanged. Plain JavaScript on purpose: Node does not strip
 * TypeScript inside node_modules, so a .ts launcher would fail after `npm install -g`.
 */

import { fileURLToPath } from "node:url";
import { main } from "@earendil-works/pi-coding-agent";

const extension = fileURLToPath(new URL("../src/index.ts", import.meta.url));
const PI_COMMANDS = new Set(["install", "remove", "uninstall", "update", "list", "config", "auth"]);

const args = process.argv.slice(2);
// What pi's own CLI entry does before main(); its setup function is not exported.
process.title = "paper";
process.env.PI_CODING_AGENT = "true";
process.env.AI_AGENT = "pi";
process.emitWarning = () => {};

const passThrough = PI_COMMANDS.has(args[0] ?? "");
await main(passThrough ? args : [...args, "--extension", extension, ...(args.includes("--paper") ? [] : ["--paper"])]);
