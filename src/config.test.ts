import { describe, expect, test } from "bun:test";
import { DEFAULT_CONFIG, loadConfig } from "./config";
import { unwrap } from "./test-helpers";

describe("DEFAULT_CONFIG", () => {
	test("has expected default values", () => {
		expect(DEFAULT_CONFIG.sourceBranch).toBeUndefined();
		expect(DEFAULT_CONFIG.targetBranch).toBe("main");
		expect(DEFAULT_CONFIG.maxIterations).toBe(10);
		expect(DEFAULT_CONFIG.worktreesDir).toBe("agent-loop/worktrees");
	});

	test("implementer has defaults", () => {
		expect(DEFAULT_CONFIG.implementer.model).toBe("opencode/kimi-k2.6");
	});

	test("reviewer has defaults", () => {
		expect(DEFAULT_CONFIG.reviewer.model).toBe("opencode/claude-sonnet-4-6");
	});
});

describe("loadConfig", () => {
	test("returns default config when file does not exist", async () => {
		const config = unwrap(await loadConfig());

		expect(config.targetBranch).toBe("main");
		expect(config.maxIterations).toBe(10);
	});
});
