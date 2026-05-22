import { describe, expect, test } from "bun:test";
import { parseCompletionSignal } from "./sdk";

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
