import { describe, expect, test } from "bun:test";
import { main } from "./index";

describe("index module", () => {
	test("main is exported as a function", () => {
		expect(typeof main).toBe("function");
	});
});
