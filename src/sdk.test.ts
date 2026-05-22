import { describe, expect, test } from "bun:test";
import { gatherContext, parseCompletionSignal } from "./sdk";

describe("parseCompletionSignal", () => {
	test("returns COMPLETE when output contains <promise>COMPLETE</promise>", () => {
		const result = parseCompletionSignal(
			"Some output <promise>COMPLETE</promise>",
		);
		expect(result).toBe("COMPLETE");
	});

	test("returns NEXT when output contains <promise>NEXT</promise>", () => {
		const result = parseCompletionSignal("Some output <promise>NEXT</promise>");
		expect(result).toBe("NEXT");
	});

	test("returns null when no signal is present", () => {
		const result = parseCompletionSignal("Some output without signal");
		expect(result).toBeNull();
	});

	test("returns null for empty string", () => {
		const result = parseCompletionSignal("");
		expect(result).toBeNull();
	});

	test("COMPLETE takes precedence over NEXT when both are present", () => {
		const result = parseCompletionSignal(
			"<promise>NEXT</promise> <promise>COMPLETE</promise>",
		);
		expect(result).toBe("COMPLETE");
	});
});

describe("gatherContext", () => {
	test("returns a string containing git status and recent commits", async () => {
		const result = await gatherContext();
		expect(typeof result).toBe("string");
		expect(result).toContain("## Context");
		expect(result).toContain("### Git Status");
		expect(result).toContain("### Recent Commits");
	});

	test("includes Project Agent Configuration when project docs exist", async () => {
		const result = await gatherContext();
		expect(result).toContain("## Project Agent Configuration");
	});

	test("includes AGENTS.md section when file exists", async () => {
		const result = await gatherContext();
		expect(result).toContain("### AGENTS.md");
		expect(result).toContain("Code Styles");
	});

	test("includes Issue Tracker section when file exists", async () => {
		const result = await gatherContext();
		expect(result).toContain("### Issue Tracker");
		expect(result).toContain("gh issue create");
	});

	test("includes Triage Labels section when file exists", async () => {
		const result = await gatherContext();
		expect(result).toContain("### Triage Labels");
		expect(result).toContain("ready-for-agent");
	});

	test("includes Domain Docs section when file exists", async () => {
		const result = await gatherContext();
		expect(result).toContain("### Domain Docs");
		expect(result).toContain("CONTEXT.md");
	});

	test("includes Available Scripts when package.json exists", async () => {
		const result = await gatherContext();
		expect(result).toContain("### Available Scripts");
		expect(result).toContain("test");
		expect(result).toContain("lint:ci");
	});
});
