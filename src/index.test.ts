import { describe, expect, test } from "bun:test";
import { $ } from "bun";
import { main } from "./index";
import { unwrapErr } from "./test-helpers";

describe("main", () => {
	test("returns ConfigError when cwd is not the main worktree", async () => {
		const branch = `test-main-${Date.now()}`;
		const worktreePath = `/tmp/${branch}`;

		// Create a linked worktree so isMainWorktree returns false
		await $`git worktree add -b ${branch} ${worktreePath}`.nothrow().quiet();

		const originalCwd = process.cwd();
		process.chdir(worktreePath);

		try {
			const result = await main();
			const error = unwrapErr(result);
			expect(error.kind).toBe("ConfigError");
			expect(error.message).toContain("main worktree");
		} finally {
			process.chdir(originalCwd);
			await $`git worktree remove ${worktreePath}`.nothrow().quiet();
			await $`git branch -D ${branch}`.nothrow().quiet();
		}
	});
});
