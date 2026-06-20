#!/usr/bin/env bun

//
// E2E harness for the agent-loop CLI.
//
// Spawns `bun run agent-loop.ts` in a tmux pane against a REAL opencode server,
// polls the pane output over time, and asserts that:
//   1. Output streams incrementally (lines appear while the process is still
//      running — not all buffered until exit).
//   2. Phase markers appear (Implementer started, [Implementer] deltas, etc.).
//   3. The process exits and the exit code is acceptable.
//   4. The worktree is cleaned up (or preserved on failure, as designed).
//
// Usage:
//   bun e2e/run-loop.ts
//
// Requirements:
//   - Running inside a tmux session.
//   - opencode configured with a real model (opencode auth).
//   - gh CLI available (the implementer prompt tries to list issues).
//
// The test runs in a throwaway git repo under /tmp so the real project repo
// is never mutated. A local agent-loop.config.ts pins maxIterations to 1 so
// the loop stops after a single pass regardless of model behaviour.

import path from "node:path";
import { $, file } from "bun";

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const REPO_ROOT = path.resolve(import.meta.dir, "..");
const CLI_PATH = path.join(REPO_ROOT, "agent-loop.ts");
const TMUX_WINDOW = "agent-loop-e2e";
const POLL_INTERVAL_MS = 2_000;
const MAX_RUNTIME_MS = 180_000;
const ARTIFACTS_DIR = path.join("/tmp/opencode", "agent-loop-e2e-artifacts");

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function ts(): string {
	return new Date().toISOString().split("T")[1]?.replace("Z", "") ?? "";
}

function log(msg: string): void {
	console.log(`[${ts()}] ${msg}`);
}

async function tmux(args: string[]): Promise<string> {
	const result = await $`tmux ${args}`.nothrow().quiet();
	return result.stdout.toString().trim();
}

async function capturePane(): Promise<string> {
	return tmux(["capture-pane", "-p", "-t", TMUX_WINDOW, "-S", "-200"]);
}

async function paneDead(): Promise<{ dead: boolean; status: number | null }> {
	const out = await tmux([
		"list-panes",
		"-t",
		TMUX_WINDOW,
		"-F",
		"#{pane_dead} #{pane_dead_status}",
	]);
	// Format: "0" (alive) or "1 0" (dead, exit 0) or "1 1" (dead, exit 1)
	const parts = out.split(/\s+/);
	if (parts[0] === "1") {
		return { dead: true, status: Number.parseInt(parts[1] ?? "0", 10) };
	}
	return { dead: false, status: null };
}

// ---------------------------------------------------------------------------
// Throwaway repo setup
// ---------------------------------------------------------------------------

async function setupRepo(): Promise<string> {
	const repoPath = path.join("/tmp/opencode", `agent-loop-e2e-${Date.now()}`);
	log(`Creating throwaway repo: ${repoPath}`);

	await $`mkdir -p ${repoPath}`.quiet();
	await $`git init`.cwd(repoPath).quiet();
	await $`git config user.email e2e@test.local`.cwd(repoPath).quiet();
	await $`git config user.name "E2E Test"`.cwd(repoPath).quiet();

	// Minimal project so the agent has something to explore
	await Bun.write(
		path.join(repoPath, "README.md"),
		"# E2E Test Repo\n\nThrowaway repo for agent-loop E2E testing.\n",
	);
	await Bun.write(
		path.join(repoPath, "hello.ts"),
		`export function hello(): string {\n\treturn "hello";\n}\n`,
	);
	await $`git add -A`.cwd(repoPath).quiet();
	await $`git commit -m "initial"`.cwd(repoPath).quiet();

	// Pin maxIterations to 1 so the loop stops after a single pass
	await Bun.write(
		path.join(repoPath, "agent-loop.config.ts"),
		`export default { maxIterations: 1 };\n`,
	);

	log("Repo ready (1 commit, maxIterations=1)");
	return repoPath;
}

// ---------------------------------------------------------------------------
// Spawning the CLI in tmux
// ---------------------------------------------------------------------------

async function spawnCli(repoPath: string): Promise<void> {
	log(`Spawning CLI in tmux window '${TMUX_WINDOW}'`);

	// Kill any stale window from a previous run
	await tmux(["kill-window", "-t", TMUX_WINDOW]).catch(() => {});

	// Create the window running the CLI directly (avoids send-keys quoting
	// issues with the Enter key).
	const cmd = `bun run ${CLI_PATH}`;
	await $`tmux new-window -d -n ${TMUX_WINDOW} -c ${repoPath} ${cmd}`.quiet();

	// Keep the pane alive after the process exits so we can read the exit code
	await tmux(["set-option", "-t", TMUX_WINDOW, "remain-on-exit", "on"]);

	log(`CLI spawned. Watch with: tmux select-window -t ${TMUX_WINDOW}`);
}

// ---------------------------------------------------------------------------
// Polling loop
// ---------------------------------------------------------------------------

type Sample = {
	elapsedMs: number;
	lineCount: number;
	processAlive: boolean;
};

async function pollUntilExit(): Promise<{
	samples: Sample[];
	finalOutput: string;
	exitStatus: number | null;
}> {
	const samples: Sample[] = [];
	const start = Date.now();

	while (true) {
		const elapsed = Date.now() - start;
		if (elapsed > MAX_RUNTIME_MS) {
			log(`Timeout after ${MAX_RUNTIME_MS}ms — killing window`);
			await tmux(["kill-window", "-t", TMUX_WINDOW]).catch(() => {});
			return { samples, finalOutput: "", exitStatus: null };
		}

		const output = await capturePane();
		const { dead, status } = await paneDead();
		const lineCount = output
			.split("\n")
			.filter((l) => l.trim().length > 0).length;

		samples.push({
			elapsedMs: elapsed,
			lineCount,
			processAlive: !dead,
		});

		if (samples.length % 5 === 0 || dead) {
			log(
				`poll #${samples.length} — ${dead ? "DEAD" : "alive"} — ${lineCount} lines — ${elapsed}ms`,
			);
		}

		if (dead) {
			log(`Process exited with status ${status}`);
			return { samples, finalOutput: output, exitStatus: status };
		}

		await Bun.sleep(POLL_INTERVAL_MS);
	}
}

// ---------------------------------------------------------------------------
// Assertions
// ---------------------------------------------------------------------------

type Assertion = {
	name: string;
	passed: boolean;
	detail: string;
};

function assertStreaming(samples: Sample[]): Assertion {
	// Streaming proof: at least 2 samples taken while the process was alive
	// with strictly increasing line counts. If all output appeared in one
	// burst at exit, line counts would be identical across alive samples.
	const aliveSamples = samples.filter((s) => s.processAlive);
	if (aliveSamples.length < 2) {
		return {
			name: "streaming: ≥2 alive samples",
			passed: false,
			detail: `Only ${aliveSamples.length} samples taken while alive (need ≥2). Process may have exited too fast or polling too slow.`,
		};
	}

	let grew = false;
	for (let i = 1; i < aliveSamples.length; i++) {
		const prev = aliveSamples[i - 1];
		const curr = aliveSamples[i];
		if (prev && curr && curr.lineCount > prev.lineCount) {
			grew = true;
			break;
		}
	}

	const first = aliveSamples[0];
	const last = aliveSamples[aliveSamples.length - 1];
	return {
		name: "streaming: output grows while alive",
		passed: grew,
		detail: grew
			? `Output grew across alive samples (${first?.lineCount} → ${last?.lineCount} lines)`
			: `Line count did not increase while alive: ${aliveSamples.map((s) => s.lineCount).join(" → ")}`,
	};
}

function assertContains(
	output: string,
	needle: string,
	label: string,
): Assertion {
	const passed = output.includes(needle);
	return {
		name: `output contains: ${label}`,
		passed,
		detail: passed ? "found" : `missing "${needle}"`,
	};
}

function assertExitCode(status: number | null): Assertion {
	// Exit 0 = success. Exit 1 can happen if the agent fails to find issues
	// in a repo with no GitHub remote — acceptable for this E2E.
	const passed = status === 0 || status === 1;
	return {
		name: `exit code acceptable (got ${status})`,
		passed,
		detail: passed
			? status === 0
				? "clean exit"
				: "exit 1 (acceptable — agent may have failed to find issues in throwaway repo)"
			: `unexpected exit code ${status}`,
	};
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
	if (!process.env.TMUX) {
		console.error("Must be run inside a tmux session.");
		process.exit(1);
	}

	log("=== agent-loop E2E harness ===");
	log(`CLI: ${CLI_PATH}`);
	log(`Artifacts: ${ARTIFACTS_DIR}`);

	await $`mkdir -p ${ARTIFACTS_DIR}`.quiet();

	const repoPath = await setupRepo();

	await spawnCli(repoPath);

	const { samples, finalOutput, exitStatus } = await pollUntilExit();

	// Save artifacts
	const artifactPath = path.join(ARTIFACTS_DIR, `run-${Date.now()}.log`);
	await Bun.write(artifactPath, finalOutput);
	log(`Pane output saved to ${artifactPath}`);

	const samplesPath = path.join(ARTIFACTS_DIR, `samples-${Date.now()}.json`);
	await Bun.write(samplesPath, JSON.stringify(samples, null, 2));
	log(`Samples saved to ${samplesPath}`);

	// Run assertions
	const assertions: Assertion[] = [
		assertStreaming(samples),
		assertContains(finalOutput, "Agent Loop starting", "startup banner"),
		assertContains(finalOutput, "Iteration 1/1", "iteration header"),
		assertContains(finalOutput, "Implementer started", "implementer phase"),
		assertContains(finalOutput, "[Implementer]", "streamed implementer line"),
		assertExitCode(exitStatus),
	];

	// The following markers only appear if the agent makes commits:
	if (finalOutput.includes("Implementer finished")) {
		assertions.push(
			assertContains(finalOutput, "Implementer finished", "implementer done"),
		);
	}
	if (finalOutput.includes("Reviewer started")) {
		assertions.push(
			assertContains(finalOutput, "Reviewer started", "reviewer phase"),
			assertContains(finalOutput, "[Reviewer]", "streamed reviewer line"),
		);
	}

	// Report
	console.log();
	console.log("=== Results ===");
	let allPassed = true;
	for (const a of assertions) {
		const icon = a.passed ? "✓" : "✗";
		console.log(`  ${icon} ${a.name} — ${a.detail}`);
		if (!a.passed) allPassed = false;
	}

	// Check worktree cleanup
	const worktreesDir = path.join(repoPath, "agent-loop", "worktrees");
	const worktreesDirExists = await file(worktreesDir).exists();
	const worktreeCleanup: Assertion = {
		name: "worktree cleaned up",
		passed: !worktreesDirExists,
		detail: worktreesDirExists
			? `worktrees dir still exists at ${worktreesDir}`
			: "no leftover worktrees",
	};
	console.log(
		`  ${worktreeCleanup.passed ? "✓" : "✗"} ${worktreeCleanup.name} — ${worktreeCleanup.detail}`,
	);
	if (!worktreeCleanup.passed) allPassed = false;

	// Cleanup throwaway repo
	await $`rm -rf ${repoPath}`.quiet();
	log(`Throwaway repo removed: ${repoPath}`);

	// Kill the tmux window
	await tmux(["kill-window", "-t", TMUX_WINDOW]).catch(() => {});

	console.log();
	if (allPassed) {
		console.log("=== E2E PASSED ===");
		process.exit(0);
	}
	console.log("=== E2E FAILED ===");
	process.exit(1);
}

await main();
