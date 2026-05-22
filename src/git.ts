import { $ } from "bun";
import { err, ok, type Result } from "neverthrow";
import { type GitError, gitError } from "./errors";

// ---------------------------------------------------------------------------
// Git helpers
// ---------------------------------------------------------------------------

export async function getCurrentBranch(): Promise<Result<string, GitError>> {
	const result = await $`git branch --show-current`.nothrow().quiet();
	if (result.exitCode !== 0) {
		return err(
			gitError("Failed to get current branch", "git branch --show-current"),
		);
	}
	return ok(result.stdout.toString().trim());
}

export async function createWorktree(
	path: string,
	branch: string,
	baseBranch: string,
): Promise<Result<void, GitError>> {
	const result = await $`git worktree add -b ${branch} ${path} ${baseBranch}`
		.nothrow()
		.quiet();
	if (result.exitCode !== 0) {
		return err(
			gitError(
				`Failed to create worktree for branch ${branch}: ${result.stderr.toString()}`,
				`git worktree add -b ${branch} ${path} ${baseBranch}`,
			),
		);
	}
	return ok(undefined);
}

export async function removeWorktree(
	path: string,
	branch: string,
): Promise<Result<void, GitError>> {
	await $`git worktree remove ${path}`.nothrow().quiet();
	await $`git branch -D ${branch}`.nothrow().quiet();
	return ok(undefined);
}

export async function hasUncommittedChanges(
	worktreePath: string,
): Promise<boolean> {
	const result = await $`git status --porcelain`
		.cwd(worktreePath)
		.nothrow()
		.quiet();
	return result.stdout.toString().trim().length > 0;
}

export async function autoCommit(
	worktreePath: string,
	message: string,
): Promise<Result<void, GitError>> {
	const hasChanges = await hasUncommittedChanges(worktreePath);
	if (!hasChanges) return ok(undefined);

	await $`git add -A`.cwd(worktreePath).quiet();
	const result = await $`git commit -m ${message}`
		.cwd(worktreePath)
		.nothrow()
		.quiet();
	if (result.exitCode !== 0) {
		return err(
			gitError("Failed to auto-commit changes", `git commit -m ${message}`),
		);
	}
	return ok(undefined);
}

export async function hasCommits(
	branch: string,
	baseBranch: string,
): Promise<boolean> {
	const result = await $`git log ${baseBranch}..${branch} --oneline`
		.nothrow()
		.quiet();
	return result.stdout.toString().trim().length > 0;
}

export async function getCommitLog(
	branch: string,
	baseBranch: string,
): Promise<string> {
	const result = await $`git log ${baseBranch}..${branch} --oneline`
		.nothrow()
		.quiet();
	return result.stdout.toString().trim();
}

export async function mergeBranch(
	branch: string,
	into: string,
): Promise<Result<void, GitError>> {
	const currentResult = await getCurrentBranch();
	if (currentResult.isErr()) {
		return err(currentResult.error);
	}

	const current = currentResult.value;
	if (current !== into) {
		return err(
			gitError(
				`Cannot merge ${branch} into ${into}: currently on branch '${current}'. Checkout ${into} first.`,
				`git checkout ${into}`,
			),
		);
	}

	const result = await $`git merge ${branch}`.nothrow().quiet();
	if (result.exitCode !== 0) {
		return err(
			gitError(
				`Merge of ${branch} into ${into} failed: ${result.stderr.toString()}`,
				`git merge ${branch}`,
			),
		);
	}
	return ok(undefined);
}

export async function branchAheadOfTarget(
	sourceBranch: string,
	targetBranch: string,
): Promise<boolean> {
	const result = await $`git log ${targetBranch}..${sourceBranch} --oneline`
		.nothrow()
		.quiet();
	return result.stdout.toString().trim().length > 0;
}

export async function createPR(
	sourceBranch: string,
	targetBranch: string,
): Promise<Result<void, GitError>> {
	const result =
		await $`gh pr create --base ${targetBranch} --head ${sourceBranch} --title "Agent Loop: Automated changes" --body "Automated changes by Agent Loop."`.nothrow();
	if (result.exitCode !== 0) {
		return err(
			gitError(
				`Failed to create PR: ${result.stderr.toString()}`,
				`gh pr create --base ${targetBranch} --head ${sourceBranch}`,
			),
		);
	}
	return ok(undefined);
}
