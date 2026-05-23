import { describe, expect, spyOn, test } from "bun:test";
import {
	gatherContext,
	parseCompletionSignal,
	runAgentPromptStreamed,
} from "./sdk";
import { unwrap, unwrapErr } from "./test-helpers";

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
			global: {
				event: async () => ({ stream }),
			},
		} as unknown as import("./sdk").OpencodeClient;
	}

	test("returns accumulated text from streamed text parts", async () => {
		const events = [
			{
				directory: "/path/to/worktree",
				payload: {
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
			},
			{
				directory: "/path/to/worktree",
				payload: {
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
			},
		];

		const finalMessages = [
			{
				info: { role: "assistant" },
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

		expect(unwrap(result)).toBe("Hello world");
	});

	test("returns error when promptAsync fails", async () => {
		const client = {
			global: {
				event: async () => ({ stream: (async function* () {})() }),
			},
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

		const error = unwrapErr(result);
		expect(error.message).toContain("prompt failed");
	});

	test("prints text and reasoning deltas with phase prefix", async () => {
		const consoleSpy = spyOn(console, "log").mockImplementation(() => {});

		const events = [
			{
				directory: "/path/to/worktree",
				payload: {
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
			},
			{
				directory: "/path/to/worktree",
				payload: {
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
			},
		];

		const finalMessages = [
			{
				info: { role: "assistant" },
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

	test("renders running tool part with title", async () => {
		const consoleSpy = spyOn(console, "log").mockImplementation(() => {});

		const events = [
			{
				directory: "/path/to/worktree",
				payload: {
					type: "message.part.updated",
					properties: {
						part: {
							type: "tool",
							id: "p1",
							sessionID: "s1",
							messageID: "m1",
							tool: "bash",
							callID: "c1",
							state: {
								status: "running",
								input: {},
								title: "listing files",
								time: { start: 0 },
							},
						},
					},
				},
			},
		];

		const client = createMockClient(events);
		await runAgentPromptStreamed(
			client,
			"s1",
			"opencode/test",
			"prompt",
			"implementer",
		);

		expect(consoleSpy).toHaveBeenCalledWith(
			"[Implementer] 🔧 bash: listing files",
		);

		consoleSpy.mockRestore();
	});

	test("renders completed tool part", async () => {
		const consoleSpy = spyOn(console, "log").mockImplementation(() => {});

		const events = [
			{
				directory: "/path/to/worktree",
				payload: {
					type: "message.part.updated",
					properties: {
						part: {
							type: "tool",
							id: "p1",
							sessionID: "s1",
							messageID: "m1",
							tool: "edit",
							callID: "c1",
							state: {
								status: "completed",
								input: {},
								output: "done",
								title: "edit file",
								metadata: {},
								time: { start: 0, end: 1 },
							},
						},
					},
				},
			},
		];

		const client = createMockClient(events);
		await runAgentPromptStreamed(
			client,
			"s1",
			"opencode/test",
			"prompt",
			"implementer",
		);

		expect(consoleSpy).toHaveBeenCalledWith("[Implementer] ✓ edit done");

		consoleSpy.mockRestore();
	});

	test("renders error tool part", async () => {
		const consoleSpy = spyOn(console, "log").mockImplementation(() => {});

		const events = [
			{
				directory: "/path/to/worktree",
				payload: {
					type: "message.part.updated",
					properties: {
						part: {
							type: "tool",
							id: "p1",
							sessionID: "s1",
							messageID: "m1",
							tool: "bash",
							callID: "c1",
							state: {
								status: "error",
								input: {},
								error: "command not found",
								metadata: {},
								time: { start: 0, end: 1 },
							},
						},
					},
				},
			},
		];

		const client = createMockClient(events);
		await runAgentPromptStreamed(
			client,
			"s1",
			"opencode/test",
			"prompt",
			"implementer",
		);

		expect(consoleSpy).toHaveBeenCalledWith(
			"[Implementer] ✗ bash: command not found",
		);

		consoleSpy.mockRestore();
	});

	test("buffers text deltas and flushes on newline", async () => {
		const consoleSpy = spyOn(console, "log").mockImplementation(() => {});

		const events = [
			{
				directory: "/path/to/worktree",
				payload: {
					type: "message.part.updated",
					properties: {
						part: {
							type: "text",
							text: "line one\nline two",
							id: "p1",
							sessionID: "s1",
							messageID: "m1",
						},
						delta: "line one\nline two",
					},
				},
			},
		];

		const finalMessages = [
			{
				info: { role: "assistant" },
				parts: [
					{
						type: "text",
						text: "line one\nline two",
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
			"implementer",
		);

		expect(consoleSpy).toHaveBeenCalledWith("[Implementer] line one");
		expect(consoleSpy).toHaveBeenCalledWith("[Implementer] line two");

		consoleSpy.mockRestore();
	});

	test("flushes remaining text buffer at stream end", async () => {
		const consoleSpy = spyOn(console, "log").mockImplementation(() => {});

		const events = [
			{
				directory: "/path/to/worktree",
				payload: {
					type: "message.part.updated",
					properties: {
						part: {
							type: "text",
							text: "no newline",
							id: "p1",
							sessionID: "s1",
							messageID: "m1",
						},
						delta: "no newline",
					},
				},
			},
		];

		const finalMessages = [
			{
				info: { role: "assistant" },
				parts: [
					{
						type: "text",
						text: "no newline",
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
			"implementer",
		);

		expect(consoleSpy).toHaveBeenCalledWith("[Implementer] no newline");

		consoleSpy.mockRestore();
	});

	test("subscribes to global events before calling promptAsync", async () => {
		const calls: string[] = [];

		const stream = (async function* () {})();

		const client = {
			global: {
				event: async () => {
					calls.push("event");
					return { stream };
				},
			},
			session: {
				promptAsync: async () => {
					calls.push("promptAsync");
				},
				messages: async () => ({ data: [] }),
			},
		} as unknown as import("./sdk").OpencodeClient;

		await runAgentPromptStreamed(
			client,
			"s1",
			"opencode/test",
			"prompt",
			"implementer",
		);

		expect(calls).toEqual(["event", "promptAsync"]);
	});

	test("ignores events from other sessions", async () => {
		const consoleSpy = spyOn(console, "log").mockImplementation(() => {});

		const events = [
			{
				directory: "/path/to/worktree",
				payload: {
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
			},
			{
				directory: "/path/to/worktree",
				payload: {
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
			},
		];

		const finalMessages = [
			{
				info: { role: "assistant" },
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

		expect(unwrap(result)).toBe("Target");
		expect(consoleSpy).not.toHaveBeenCalledWith(
			expect.stringContaining("Other"),
		);

		consoleSpy.mockRestore();
	});

	test("extracts text from SDK-shaped session.messages response", async () => {
		const events = [
			{
				directory: "/path/to/worktree",
				payload: {
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
			},
		];

		// Real SDK shape: Array<{ info: Message; parts: Array<Part> }>
		const finalMessages = [
			{
				info: {
					role: "user",
					id: "u1",
					sessionID: "s1",
				},
				parts: [
					{
						type: "text",
						text: "test prompt",
						id: "pu1",
						sessionID: "s1",
						messageID: "u1",
					},
				],
			},
			{
				info: {
					role: "assistant",
					id: "a1",
					sessionID: "s1",
				},
				parts: [
					{
						type: "text",
						text: "Hello world",
						id: "p1",
						sessionID: "s1",
						messageID: "a1",
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

		expect(unwrap(result)).toBe("Hello world");
	});

	test("breaks stream on session.idle and returns accumulated text", async () => {
		// This simulates the real SDK behavior: the stream stays open,
		// but emits session.idle when the agent finishes.
		const events = [
			{
				directory: "/path/to/worktree",
				payload: {
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
			},
			{
				directory: "/path/to/worktree",
				payload: {
					type: "session.idle",
					properties: {
						sessionID: "s1",
					},
				},
			},
			// Stream continues forever — but we should have already broken out
		];

		// Even if session.messages returns empty/wrong shape,
		// accumulated text from streaming should be used
		const finalMessages: unknown[] = [];

		const client = createMockClient(events, finalMessages);
		const result = await runAgentPromptStreamed(
			client,
			"s1",
			"opencode/test",
			"prompt",
			"implementer",
		);

		expect(unwrap(result)).toBe("Done");
	});
});
