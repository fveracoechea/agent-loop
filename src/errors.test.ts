import { describe, expect, test } from "bun:test";
import { configError, gitError, sdkError, validationError } from "./errors";

describe("error helpers", () => {
	test("configError creates a ConfigError", () => {
		const error = configError("Missing field", "./config.ts");

		expect(error.kind).toBe("ConfigError");
		expect(error.message).toBe("Missing field");
		expect(error.path).toBe("./config.ts");
	});

	test("configError works without a path", () => {
		const error = configError("Missing field");

		expect(error.kind).toBe("ConfigError");
		expect(error.message).toBe("Missing field");
		expect(error.path).toBeUndefined();
	});

	test("gitError creates a GitError", () => {
		const error = gitError("Branch not found", "git checkout main");

		expect(error.kind).toBe("GitError");
		expect(error.message).toBe("Branch not found");
		expect(error.command).toBe("git checkout main");
	});

	test("sdkError creates a SdkError", () => {
		const error = sdkError("Timeout", "/v1/chat");

		expect(error.kind).toBe("SdkError");
		expect(error.message).toBe("Timeout");
		expect(error.endpoint).toBe("/v1/chat");
	});

	test("validationError creates a ValidationError", () => {
		const error = validationError("Invalid input");

		expect(error.kind).toBe("ValidationError");
		expect(error.message).toBe("Invalid input");
	});
});
