import { describe, expect, test } from "bun:test";
import { resolveWorktreePath } from "./path";

describe("resolveWorktreePath", () => {
	test("resolves a relative baseDir against originalCwd", () => {
		const result = resolveWorktreePath("worktrees", "/home/user/project", 123);
		expect(result).toBe("/home/user/project/worktrees/123");
	});

	test("uses an absolute baseDir directly", () => {
		const result = resolveWorktreePath(
			"/tmp/worktrees",
			"/home/user/project",
			456,
		);
		expect(result).toBe("/tmp/worktrees/456");
	});
});
