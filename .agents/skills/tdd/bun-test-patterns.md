# Bun Test Patterns

This project uses `bun:test`. It runs tests in parallel by default and provides a Jest-compatible API.

## Basics

```typescript
import { describe, expect, spyOn, test } from "bun:test";
```

- `describe` / `test` for organization
- `expect` for assertions (same API as Jest)
- `spyOn` for mocking — **use only at system boundaries** (console, timers, external modules)

## Async Tests

Always use `async / await` in the test callback. Bun handles the promise automatically.

```typescript
// GOOD
import { test } from "bun:test";

test("user can create a session", async () => {
  const result = await createSession(client);
  expect(result.isOk()).toBe(true);
});

// BAD — missing await, test exits before assertion runs
test("user can create a session", () => {
  createSession(client).then((result) => {
    expect(result.isOk()).toBe(true);
  });
});
```

## Unwrapping `Result` Types

This codebase uses `neverthrow` `Result<T, E>` for errors. The default pattern is verbose:

```typescript
// Verbose — avoid writing this repeatedly
test("returns config defaults", async () => {
  const result = await loadConfig();
  expect(result.isOk()).toBe(true);
  if (result.isOk()) {
    expect(result.value.targetBranch).toBe("main");
  }
});
```

Use small helpers to collapse the guard:

```typescript
// In a test utility file (e.g. src/test-helpers.ts)
function formatError<E>(error: E): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

export function unwrap<T, E>(result: import("neverthrow").Result<T, E>): T {
  if (result.isErr()) {
    throw new Error(`Expected ok, got err: ${formatError(result.error)}`);
  }
  return result.value;
}

export function unwrapErr<T, E>(result: import("neverthrow").Result<T, E>): E {
  if (result.isOk()) {
    throw new Error(`Expected err, got ok: ${String(result.value)}`);
  }
  return result.error;
}
```

Then tests read cleanly:

```typescript
import { unwrap, unwrapErr } from "./test-helpers";

test("returns config defaults", async () => {
  const config = unwrap(await loadConfig());
  expect(config.targetBranch).toBe("main");
  expect(config.maxIterations).toBe(10);
});

test("returns error when file is missing", async () => {
  const error = unwrapErr(await loadConfig("missing.ts"));
  expect(error.message).toContain("not found");
});
```

This keeps tests focused on behavior, not Result plumbing.

## Spying on System Boundaries

`spyOn` replaces a method on an object. Restore it after the test so later tests aren't affected.

```typescript
import { spyOn, test } from "bun:test";

test("prints phase prefix to console", async () => {
  const consoleSpy = spyOn(console, "log").mockImplementation(() => {});

  await runAgentPromptStreamed(/* … */);

  expect(consoleSpy).toHaveBeenCalledWith("[Implementer] Hello");

  consoleSpy.mockRestore();
});
```

Rules:
- Spy on `console`, `process`, or external modules only
- Never spy on your own internal functions — that couples tests to implementation
- Always call `mockRestore()` (or use `afterEach` for global cleanup)

## File Co-location

Tests live next to the code they test:

```
src/
  sdk.ts
  sdk.test.ts
  config.ts
  config.test.ts
```

This makes it obvious which tests cover which module, and deleting a module deletes its tests automatically.

## Test Organization: `describe` vs Flat

Use `describe` blocks to group related behaviors — one block per function or per concept. Keep tests inside a block focused on that single thing.

```typescript
// GOOD: Grouped by function, clear what each test covers
describe("parseCompletionSignal", () => {
  test("returns COMPLETE when tag is present", () => { … });
  test("returns NEXT when tag is present", () => { … });
  test("returns null when no tag is present", () => { … });
});

describe("runAgentPromptStreamed", () => {
  test("returns accumulated text from parts", async () => { … });
  test("returns error when promptAsync fails", async () => { … });
  test("skips non-text non-reasoning parts", async () => { … });
});
```

Avoid deep nesting. One or two levels of `describe` is enough. Deeper nesting makes tests harder to scan and obscures which setup applies to which test.

```typescript
// BAD: Deeply nested, hard to tell what's being tested
describe("sdk", () => {
  describe("session", () => {
    describe("when creating", () => {
      describe("with valid client", () => {
        test("works", () => { … });
      });
    });
  });
});
```

Use flat tests (no `describe`) only when a module exports a single function with very few behaviors. As soon as you have multiple functions or multiple dimensions of behavior, add `describe` blocks.

## Running Tests

```bash
# All tests
bun test

# Single file
bun test src/sdk.test.ts

# Watch mode
bun test --watch
```

The CI command is `bun test` (defined in `package.json`).
