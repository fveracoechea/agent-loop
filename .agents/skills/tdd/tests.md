# Good and Bad Tests

## Good Tests

**Integration-style**: Test through real interfaces, not mocks of internal parts.

```typescript
// GOOD: Tests observable behavior
test("user can checkout with valid cart", async () => {
  const cart = createCart();
  cart.add(product);
  const result = await checkout(cart, paymentMethod);
  expect(result.status).toBe("confirmed");
});
```

Characteristics:

- Tests behavior users/callers care about
- Uses public API only
- Survives internal refactors
- Describes WHAT, not HOW
- One logical assertion per test

## Bad Tests

**Implementation-detail tests**: Coupled to internal structure.

```typescript
// BAD: Tests implementation details
test("checkout calls paymentService.process", async () => {
  const mockPayment = jest.mock(paymentService);
  await checkout(cart, payment);
  expect(mockPayment.process).toHaveBeenCalledWith(cart.total);
});
```

Red flags:

- Mocking internal collaborators
- Testing private methods
- Asserting on call counts/order
- Test breaks when refactoring without behavior change
- Test name describes HOW not WHAT
- Verifying through external means instead of interface

```typescript
// BAD: Bypasses interface to verify
test("createUser saves to database", async () => {
  await createUser({ name: "Alice" });
  const row = await db.query("SELECT * FROM users WHERE name = ?", ["Alice"]);
  expect(row).toBeDefined();
});

// GOOD: Verifies through interface
test("createUser makes user retrievable", async () => {
  const user = await createUser({ name: "Alice" });
  const retrieved = await getUser(user.id);
  expect(retrieved.name).toBe("Alice");
});

## Format Tests

**Format tests** assert on the exact structure of a string or object instead of what the caller actually needs from it. These break when wording, indentation, or markup changes even though behavior hasn't.

```typescript
// BAD: Coupled to exact heading format and wording
test("gatherContext includes project configuration", async () => {
  const result = await gatherContext();
  expect(result).toContain("## Project Agent Configuration");
  expect(result).toContain("### AGENTS.md");
});
```

Why this is bad:
- If you rename the heading to `# Project Agent Configuration`, the test fails but the feature still works
- If you remove the `### AGENTS.md` sub-heading and inline the content, the test fails but the feature still works
- The test is asserting on *presentation*, not *behavior*

```typescript
// GOOD: Asserts on what the caller needs
test("gatherContext makes project docs discoverable", async () => {
  const result = await gatherContext();
  // The agent needs to know conventions exist — exact heading doesn't matter
  expect(result.toLowerCase()).toContain("agents.md");
  expect(result.toLowerCase()).toContain("issue tracker");
});
```

**Prefer snapshot tests for stable format-heavy output.** If the exact format matters (e.g., a CLI renders a table), use a snapshot test so changes are deliberate and visible in review:

```typescript
// ACCEPTABLE: Snapshot locks format intentionally
test("help output matches snapshot", () => {
  expect(renderHelp()).toMatchSnapshot();
});
```

## Weak Assertions

A **weak assertion** checks something trivially true (like a type or non-emptiness) without verifying the behavior actually works. These give false confidence.

```typescript
// BAD: Only proves the function didn't throw
test("getCommitLog returns a string", async () => {
  const result = await getCommitLog("HEAD", "HEAD");
  expect(typeof result).toBe("string");
});

// BAD: Only proves it returns a boolean, not whether the answer is correct
test("branchAheadOfTarget returns a boolean", async () => {
  const result = await branchAheadOfTarget("HEAD", "HEAD");
  expect(typeof result).toBe("boolean");
});
```

Why this is bad:
- `HEAD..HEAD` is always empty, so `getCommitLog` returns `""` — a string, but not a meaningful one
- `branchAheadOfTarget("HEAD", "HEAD")` is always `false`, but the test would pass even if the logic were completely wrong
- The assertion is so weak it can't distinguish correct from broken behavior

```typescript
// GOOD: Assert on meaningful behavior with real data
test("getCommitLog formats commits between branches", async () => {
  const log = await getCommitLog("main", "feature-branch");
  expect(log).toContain("feat: add user authentication");
  expect(log.split("\n").length).toBeGreaterThanOrEqual(3);
});

test("branchAheadOfTarget detects commits not in target", async () => {
  // Use a branch we know is ahead of main
  const isAhead = await branchAheadOfTarget("feature-branch", "main");
  expect(isAhead).toBe(true);

  // Same branch should never be ahead
  const sameBranch = await branchAheadOfTarget("main", "main");
  expect(sameBranch).toBe(false);
});
```

When you can't use real data, use a **seam** that exercises the actual logic:

```typescript
// GOOD: Use a test fixture that exercises the real code path
test("checkout confirms payment before completing", async () => {
  const cart = createCart({ total: 100 });
  const payment = createFailingPaymentGateway();

  await expect(checkout(cart, payment)).rejects.toThrow("payment declined");
});

## Snapshot Testing

**Use snapshots when the exact output format matters** and is expected to be stable — CLI help text, rendered markdown, generated config files, etc. Snapshots turn format changes into deliberate, reviewable diffs instead of silent test failures.

```typescript
// GOOD: Snapshot for stable CLI output
test("help text matches expected format", () => {
  expect(renderHelp()).toMatchSnapshot();
});
```

**Do not use snapshots for unstable or dynamic data.** If the output includes timestamps, random IDs, or platform-specific paths, the snapshot will flap and lose its value.

```typescript
// BAD: Snapshot will break on every run
test("report includes timestamp", () => {
  expect(generateReport()).toMatchSnapshot(); // contains new Date().toISOString()
});
```

**Snapshot discipline:**
- Treat snapshot changes as code changes — review them in PRs, don't blindly update
- Use `bun test --update-snapshots` only after confirming the new output is correct
- Keep snapshot files committed so CI can detect unintended output changes
- If a snapshot fails and the change is intentional, update it; if not, fix the code
- Prefer explicit assertions over snapshots when the format is simple enough to assert directly
```
```
