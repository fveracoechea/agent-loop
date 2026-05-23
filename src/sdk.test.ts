import { describe, expect, spyOn, test } from "bun:test";
import {
	gatherContext,
	parseCompletionSignal,
	runAgentPromptStreamed,
} from "./sdk";

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

describe("runAgentPromptStreamed", () => {
	function createMockClient(
		streamEvents: unknown[],
		finalMessages: unknown[] = [],
	) {
		const stream = (async function* () {
			for (const event of streamEvents) {
				yield event;
			}
		})();

		return {
			session: {
				promptAsync: async () => ({ data: undefined }),
				messages: async () => ({ data: finalMessages }),
			},
			event: {
				subscribe: async () => ({ stream }),
			},
		} as unknown as import("./sdk").OpencodeClient;
	}

	test("returns accumulated text from streamed text parts", async () => {
		const events = [
			{
				type: "message.part.updated",
				properties: {
					part: {
						type: "text",
						text: "Hello ",
						id: "p1",
						sessionID: "s1",
						messageID: "m1",
					},
					delta: "Hello ",
				},
			},
			{
				type: "message.part.updated",
				properties: {
					part: {
						type: "text",
						text: "Hello world",
						id: "p1",
						sessionID: "s1",
						messageID: "m1",
					},
					delta: "world",
				},
			},
		];

		const finalMessages = [
			{
				role: "assistant",
				parts: [
					{
						type: "text",
						text: "Hello world",
					},
				],
			},
		];

		const client = createMockClient(events, finalMessages);
		const result = await runAgentPromptStreamed(
			client,
			"s1",
			"opencode/test",
			"test prompt",
			"implementer",
		);

		expect(result.isOk()).toBe(true);
		if (result.isOk()) {
			expect(result.value).toBe("Hello world");
		}
	});

	test("returns error when promptAsync fails", async () => {
		const client = {
			session: {
				promptAsync: async () => {
					throw new Error("prompt failed");
				},
			},
		} as unknown as import("./sdk").OpencodeClient;

		const result = await runAgentPromptStreamed(
			client,
			"s1",
			"opencode/test",
			"test prompt",
			"implementer",
		);

		expect(result.isErr()).toBe(true);
		if (result.isErr()) {
			expect(result.error.message).toContain("prompt failed");
		}
	});

	test("prints text and reasoning deltas with phase prefix", async () => {
		const consoleSpy = spyOn(console, "log").mockImplementation(() => {});

		const events = [
			{
				type: "message.part.updated",
				properties: {
					part: {
						type: "text",
						text: "Done",
						id: "p1",
						sessionID: "s1",
						messageID: "m1",
					},
					delta: "Done",
				},
			},
			{
				type: "message.part.updated",
				properties: {
					part: {
						type: "reasoning",
						text: "Thinking...",
						id: "p2",
						sessionID: "s1",
						messageID: "m1",
					},
					delta: "Thinking...",
				},
			},
		];

		const finalMessages = [
			{
				role: "assistant",
				parts: [
					{
						type: "text",
						text: "Done",
					},
				],
			},
		];

		const client = createMockClient(events, finalMessages);
		await runAgentPromptStreamed(
			client,
			"s1",
			"opencode/test",
			"prompt",
			"reviewer",
		);

		expect(consoleSpy).toHaveBeenCalledWith("[Reviewer] Done");
		expect(consoleSpy).toHaveBeenCalledWith("[Reviewer] Thinking...");

		consoleSpy.mockRestore();
	});

	test("skips non-text non-reasoning parts", async () => {
		const consoleSpy = spyOn(console, "log").mockImplementation(() => {});

		const events = [
			{
				type: "message.part.updated",
				properties: {
					part: {
						type: "tool",
						id: "p1",
						sessionID: "s1",
						messageID: "m1",
					},
				},
			},
			{
				type: "message.part.updated",
				properties: {
					part: {
						type: "text",
						text: "Result",
						id: "p2",
						sessionID: "s1",
						messageID: "m1",
					},
					delta: "Result",
				},
			},
		];

		const finalMessages = [
			{
				role: "assistant",
				parts: [
					{
						type: "text",
						text: "Result",
					},
				],
			},
		];

		const client = createMockClient(events, finalMessages);
		const result = await runAgentPromptStreamed(
			client,
			"s1",
			"opencode/test",
			"prompt",
			"implementer",
		);

		expect(result.isOk()).toBe(true);
		expect(consoleSpy).not.toHaveBeenCalledWith(
			expect.stringContaining("[tool]"),
		);
		expect(consoleSpy).toHaveBeenCalledWith("[Implementer] Result");

		consoleSpy.mockRestore();
	});

	test("ignores events from other sessions", async () => {
		const consoleSpy = spyOn(console, "log").mockImplementation(() => {});

		const events = [
			{
				type: "message.part.updated",
				properties: {
					part: {
						type: "text",
						text: "Other",
						id: "p1",
						sessionID: "other-session",
						messageID: "m1",
					},
					delta: "Other",
				},
			},
			{
				type: "message.part.updated",
				properties: {
					part: {
						type: "text",
						text: "Target",
						id: "p2",
						sessionID: "s1",
						messageID: "m1",
					},
					delta: "Target",
				},
			},
		];

		const finalMessages = [
			{
				role: "assistant",
				parts: [
					{
						type: "text",
						text: "Target",
					},
				],
			},
		];

		const client = createMockClient(events, finalMessages);
		const result = await runAgentPromptStreamed(
			client,
			"s1",
			"opencode/test",
			"prompt",
			"implementer",
		);

		expect(result.isOk()).toBe(true);
		if (result.isOk()) {
			expect(result.value).toBe("Target");
		}
		expect(consoleSpy).not.toHaveBeenCalledWith(
			expect.stringContaining("Other"),
		);

		consoleSpy.mockRestore();
	});
});
