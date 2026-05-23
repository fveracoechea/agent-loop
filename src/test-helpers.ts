import type { Result } from "neverthrow";

function formatError<E>(error: E): string {
	if (error instanceof Error) return error.message;
	return String(error);
}

/**
 * Unwraps a Result, returning the Ok value or throwing if it is Err.
 *
 * Use this in tests to avoid repetitive `if (result.isOk())` guards.
 * If the result is Err, the test fails with a descriptive message.
 */
export function unwrap<T, E>(result: Result<T, E>): T {
	if (result.isErr()) {
		throw new Error(`Expected ok, got err: ${formatError(result.error)}`);
	}
	return result.value;
}

/**
 * Unwraps a Result, returning the Err value or throwing if it is Ok.
 *
 * Use this in tests that assert on error behavior.
 */
export function unwrapErr<T, E>(result: Result<T, E>): E {
	if (result.isOk()) {
		throw new Error(`Expected err, got ok: ${String(result.value)}`);
	}
	return result.error;
}
