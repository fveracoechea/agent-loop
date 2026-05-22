import { describe, expect, test } from "bun:test";
import { logger } from "./logger";

describe("logger", () => {
	test("is exported as an object with logging methods", () => {
		expect(logger).toBeDefined();
		expect(typeof logger.info).toBe("function");
		expect(typeof logger.warn).toBe("function");
		expect(typeof logger.error).toBe("function");
		expect(typeof logger.success).toBe("function");
	});
});
