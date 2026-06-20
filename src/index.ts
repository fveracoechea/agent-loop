import path from "node:path";
import { err, ok, type Result } from "neverthrow";
import { loadConfig } from "./config";
import type { AgentLoopError } from "./errors";
import {
	autoCommit,
	branchAheadOfTarget,
	createPR,
	createWorktree,
	getCommitLog,
	getCurrentBranch,
	hasCommits,
	isMainWorktree,
	mergeBranch,
	removeWorktree,
} from "./git";
import { logger } from "./logger";
import { resolveWorktreePath } from "./path";
import { implementPrompt } from "./prompts/implement-prompt";
import { reviewPrompt } from "./prompts/review-prompt";
import {
	type CompletionSignal,
	createSession,
	deleteSession,
	gatherContext,
	parseCompletionSignal,
	runAgentPromptStreamed,
	startServer,
} from "./sdk";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type AgentLoopResult = {
	iterations: number;
	prCreated: boolean;
};

// ---------------------------------------------------------------------------
// Orchestration
// ---------------------------------------------------------------------------

export async function main(): Promise<Result<AgentLoopResult, AgentLoopError>> {
	logger.info("Agent Loop starting...");

	// Load config
	const configResult = await loadConfig();
	if (configResult.isErr()) {
		return err(configResult.error);
	}
	const config = configResult.value;

	// Determine source branch
	const sourceBranch =
		config.sourceBranch ?? (await getCurrentBranch()).unwrapOr(undefined);
	if (!sourceBranch) {
		return err({
			kind: "ConfigError",
			message:
				"Could not determine source branch. Set it in agent-loop.config.ts or run from a git branch.",
		});
	}
	logger.info(`Source branch: ${sourceBranch}`);

	// Verify we're on the source branch
	const currentBranchResult = await getCurrentBranch();
	if (currentBranchResult.isErr()) {
		return err(currentBranchResult.error);
	}
	const currentBranch = currentBranchResult.value;

	if (currentBranch !== sourceBranch) {
		return err({
			kind: "GitError",
			message: `You must be on the source branch '${sourceBranch}' to run Agent Loop. Current branch: '${currentBranch}'.`,
			command: `git checkout ${sourceBranch}`,
		});
	}

	// Guard: must run from the main worktree
	const mainWorktreeResult = await isMainWorktree();
	if (mainWorktreeResult.isErr()) {
		return err(mainWorktreeResult.error);
	}
	if (!mainWorktreeResult.value) {
		return err({
			kind: "ConfigError",
			message:
				"Agent Loop must be run from the main worktree, not a linked worktree.",
		});
	}

	const originalCwd = process.cwd();
	const absoluteWorktreesDir = path.resolve(originalCwd, config.worktreesDir);

	// Ensure worktrees directory exists
	await Bun.$`mkdir -p ${absoluteWorktreesDir}`.quiet();

	let completionSignal: CompletionSignal = null;
	let iterationsCompleted = 0;
	let prCreated = false;

	for (let iteration = 1; iteration <= config.maxIterations; iteration++) {
		const branch = `agent-loop/${Date.now()}`;
		const worktreePath = resolveWorktreePath(
			absoluteWorktreesDir,
			originalCwd,
			Date.now(),
		);

		logger.info(`\n=== Iteration ${iteration}/${config.maxIterations} ===`);
		logger.info(`Branch: ${branch}`);
		logger.info(`Worktree: ${worktreePath}`);

		// Create worktree
		const worktreeResult = await createWorktree(
			worktreePath,
			branch,
			sourceBranch,
		);
		if (worktreeResult.isErr()) {
			logger.error(`Failed to create worktree for branch ${branch}. Aborting.`);
			return err(worktreeResult.error);
		}

		let iterationFailed = false;

		try {
			// Change into worktree directory for the server
			process.chdir(worktreePath);

			// Start opencode server
			const serverResult = await startServer();
			if (serverResult.isErr()) {
				logger.error(
					`Failed to start opencode server: ${serverResult.error.message}`,
				);
				iterationFailed = true;
				break;
			}
			const { client, close } = serverResult.value;

			try {
				// Gather context
				const context = await gatherContext();

				// -----------------------------------------------------------------
				// Phase 1: Implementer
				// -----------------------------------------------------------------

				const fullImplementPrompt = `${context}\n\n${implementPrompt}`;

				logger.info("🔨 Implementer started");

				const implSessionResult = await createSession(client);
				if (implSessionResult.isErr()) {
					logger.error(
						`Failed to create implementer session: ${implSessionResult.error.message}`,
					);
					iterationFailed = true;
					break;
				}
				const implSessionId = implSessionResult.value;

				const implResult = await runAgentPromptStreamed(
					client,
					implSessionId,
					config.implementer.model,
					fullImplementPrompt,
					"implementer",
				);

				if (implResult.isOk()) {
					logger.info("📋 Implementer finished");
					completionSignal = parseCompletionSignal(implResult.value);
				} else {
					logger.warn(`Implementer prompt failed: ${implResult.error.message}`);
				}

				await deleteSession(client, implSessionId);

				// Auto-commit any uncommitted changes
				const implCommitResult = await autoCommit(
					worktreePath,
					`Agent Loop: auto-commit implementer changes [iteration ${iteration}]`,
				);
				if (implCommitResult.isErr()) {
					logger.warn(`Auto-commit failed: ${implCommitResult.error.message}`);
				}

				// Check commits
				const hasImplCommits = await hasCommits(branch, sourceBranch);

				if (!hasImplCommits) {
					logger.info("No commits made. Skipping review.");

					if (completionSignal === "COMPLETE") {
						logger.info(
							"Implementer signaled completion. All issues resolved.",
						);
						break;
					}

					continue;
				}

				logger.info(`Commits:\n${await getCommitLog(branch, sourceBranch)}`);

				// -----------------------------------------------------------------
				// Phase 2: Reviewer
				// -----------------------------------------------------------------

				const fullReviewPrompt = `${context}\n\n${reviewPrompt}`;

				logger.info("🔍 Reviewer started");

				const reviewSessionResult = await createSession(client);
				if (reviewSessionResult.isErr()) {
					logger.error(
						`Failed to create reviewer session: ${reviewSessionResult.error.message}`,
					);
					iterationFailed = true;
					break;
				}
				const reviewSessionId = reviewSessionResult.value;

				const reviewResult = await runAgentPromptStreamed(
					client,
					reviewSessionId,
					config.reviewer.model,
					fullReviewPrompt,
					"reviewer",
				);

				if (reviewResult.isOk()) {
					logger.info("📋 Reviewer finished");
				} else {
					logger.warn(`Reviewer prompt failed: ${reviewResult.error.message}`);
				}

				await deleteSession(client, reviewSessionId);

				// Auto-commit any uncommitted changes
				const reviewCommitResult = await autoCommit(
					worktreePath,
					`Agent Loop: auto-commit reviewer changes [iteration ${iteration}]`,
				);
				if (reviewCommitResult.isErr()) {
					logger.warn(
						`Auto-commit failed: ${reviewCommitResult.error.message}`,
					);
				}
			} finally {
				await close();
			}

			// Restore original CWD before git operations
			process.chdir(originalCwd);

			// -----------------------------------------------------------------
			// Merge iteration branch back to source
			// -----------------------------------------------------------------

			const mergeResult = await mergeBranch(branch, sourceBranch);
			if (mergeResult.isErr()) {
				logger.error(
					`Merge of ${branch} into ${sourceBranch} failed. Preserving worktree for inspection.`,
				);
				iterationFailed = true;
				break;
			}

			logger.info(`Merged ${branch} into ${sourceBranch}`);

			// -----------------------------------------------------------------
			// Iteration summary
			// -----------------------------------------------------------------

			const commitLog = await getCommitLog(branch, sourceBranch);
			const commitCount = commitLog
				.split("\n")
				.filter((line) => line.trim().length > 0).length;

			logger.info("\n=== Iteration Summary ===");
			logger.info(`Signal: ${completionSignal ?? "(none)"}`);
			logger.info(`Commits: ${commitCount}`);
			if (commitCount > 0) {
				logger.info(`Commit log:\n${commitLog}`);
			}
			logger.info(`Merge: success`);
			logger.info("========================\n");

			// -----------------------------------------------------------------
			// Stop condition
			// -----------------------------------------------------------------

			if (completionSignal === "COMPLETE") {
				logger.info("Implementer signaled completion. All issues resolved.");
				break;
			}

			if (completionSignal !== "NEXT") {
				logger.warn(
					"Warning: Implementer did not output <promise>NEXT</promise> or <promise>COMPLETE</promise>. Continuing anyway.",
				);
			}

			logger.info("Iteration complete. Continuing...");
		} finally {
			// Ensure we're back in original CWD
			process.chdir(originalCwd);

			// Cleanup worktree
			if (!iterationFailed) {
				logger.info("Removing worktree...");
				await removeWorktree(worktreePath, branch);
			} else {
				logger.info(`Worktree preserved at: ${worktreePath}`);
				logger.info(
					`Clean up manually with: git worktree remove ${worktreePath} && git branch -D ${branch}`,
				);
			}
		}

		iterationsCompleted = iteration;
	}

	// Remove the now-empty worktrees parent directory. Uses rmdir so any
	// preserved (failed-iteration) worktrees are left intact.
	await Bun.$`rmdir ${absoluteWorktreesDir}`.nothrow().quiet();

	// ---------------------------------------------------------------------------
	// Final PR
	// ---------------------------------------------------------------------------

	logger.info("\nAgent Loop finished.");

	const hasChanges = await branchAheadOfTarget(
		sourceBranch,
		config.targetBranch,
	);
	if (hasChanges) {
		logger.info(
			`\nCreating PR from ${sourceBranch} to ${config.targetBranch}...`,
		);
		const prResult = await createPR(sourceBranch, config.targetBranch);
		if (prResult.isOk()) {
			prCreated = true;
			logger.success("PR created successfully.");
		} else {
			logger.warn(`Failed to create PR: ${prResult.error.message}`);
		}
	} else {
		logger.info("\nNo changes to create a PR for.");
	}

	return ok({ iterations: iterationsCompleted, prCreated });
}
