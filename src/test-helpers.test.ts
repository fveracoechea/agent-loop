import { describe, expect, test } from "bun:test";
import { err, ok } from "neverthrow";
import { unwrap, unwrapErr } from "./test-helpers";

describe("unwrap", () => {
	test("returns the ok value", () => {
		expect(unwrap(ok("hello"))).toBe("hello");
	});

	test("throws when given an err result", () => {
		expect(() => unwrap(err(new Error("boom")))).toThrow("boom");
	});
});

describe("unwrapErr", () => {
	test("returns the err value", () => {
		expect(unwrapErr(err(new Error("boom")))).toBeInstanceOf(Error);
	});

	test("throws when given an ok result", () => {
		expect(() => unwrapErr(ok("hello"))).toThrow("Expected err, got ok: hello");
	});
});
