import { err, ok, type Result } from "neverthrow";

// ---------------------------------------------------------------------------
// Error types
// ---------------------------------------------------------------------------

export type ConfigError = {
	kind: "ConfigError";
	message: string;
	path?: string;
};

export type GitError = {
	kind: "GitError";
	message: string;
	command: string;
};

export type SdkError = {
	kind: "SdkError";
	message: string;
	endpoint: string;
};

export type ValidationError = {
	kind: "ValidationError";
	message: string;
};

export type AgentLoopError =
	| ConfigError
	| GitError
	| SdkError
	| ValidationError;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

export function configError(message: string, path?: string): ConfigError {
	return { kind: "ConfigError", message, path };
}

export function gitError(message: string, command: string): GitError {
	return { kind: "GitError", message, command };
}

export function sdkError(message: string, endpoint: string): SdkError {
	return { kind: "SdkError", message, endpoint };
}

export function validationError(message: string): ValidationError {
	return { kind: "ValidationError", message };
}

// ---------------------------------------------------------------------------
// Neverthrow wrappers
// ---------------------------------------------------------------------------

export function okResult<T>(value: T): Result<T, never> {
	return ok(value);
}

export function errResult<E extends AgentLoopError>(
	error: E,
): Result<never, E> {
	return err(error);
}
