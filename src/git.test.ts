import { describe, expect, test } from "bun:test";
import { $ } from "bun";
import {
	autoCommit,
	branchAheadOfTarget,
	createPR,
	createWorktree,
	getCommitLog,
	getCurrentBranch,
	hasCommits,
	hasUncommittedChanges,
	isMainWorktree,
	mergeBranch,
	removeWorktree,
} from "./git";
import { unwrap } from "./test-helpers";

describe("git module", () => {
	test("getCurrentBranch returns the current branch", async () => {
		const branch = unwrap(await getCurrentBranch());
		expect(branch.length).toBeGreaterThan(0);
	});

	test("isMainWorktree returns true in the main worktree", async () => {
		const result = await isMainWorktree();
		expect(unwrap(result)).toBe(true);
	});

	test("isMainWorktree returns false inside a linked worktree", async () => {
		const branch = `test-worktree-${Date.now()}`;
		const baseBranch = unwrap(await getCurrentBranch());
		const worktreePath = `/tmp/${branch}`;

		unwrap(await createWorktree(worktreePath, branch, baseBranch));

		const originalCwd = process.cwd();
		process.chdir(worktreePath);

		try {
			const result = await isMainWorktree();
			expect(unwrap(result)).toBe(false);
		} finally {
			process.chdir(originalCwd);
			await $`git worktree remove ${worktreePath}`.nothrow().quiet();
			await $`git branch -D ${branch}`.nothrow().quiet();
		}
	});

	test("hasCommits can check for commits between branches", async () => {
		const result = await hasCommits("HEAD", "HEAD");
		expect(typeof result).toBe("boolean");
	});

	test("getCommitLog returns a string", async () => {
		const result = await getCommitLog("HEAD", "HEAD");
		expect(typeof result).toBe("string");
	});

	test("branchAheadOfTarget returns a boolean", async () => {
		const result = await branchAheadOfTarget("HEAD", "HEAD");
		expect(typeof result).toBe("boolean");
	});

	test("hasUncommittedChanges returns a boolean", async () => {
		const result = await hasUncommittedChanges(".");
		expect(typeof result).toBe("boolean");
	});

	test("all functions are exported", () => {
		expect(typeof createWorktree).toBe("function");
		expect(typeof removeWorktree).toBe("function");
		expect(typeof autoCommit).toBe("function");
		expect(typeof mergeBranch).toBe("function");
		expect(typeof createPR).toBe("function");
	});
});
