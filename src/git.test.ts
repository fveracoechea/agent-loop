import { describe, expect, test } from "bun:test";
import {
	autoCommit,
	branchAheadOfTarget,
	createPR,
	createWorktree,
	getCommitLog,
	getCurrentBranch,
	hasCommits,
	hasUncommittedChanges,
	mergeBranch,
	removeWorktree,
} from "./git";
import { unwrap } from "./test-helpers";

describe("git module", () => {
	test("getCurrentBranch returns the current branch", async () => {
		const branch = unwrap(await getCurrentBranch());
		expect(branch.length).toBeGreaterThan(0);
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
