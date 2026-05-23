# Interface Design for Testability

Good interfaces make testing natural:

1. **Accept dependencies, don't create them**

   ```typescript
   // Testable
   function processOrder(order, paymentGateway) {}

   // Hard to test
   function processOrder(order) {
     const gateway = new StripeGateway();
   }
   ```

2. **Return results, don't produce side effects**

   ```typescript
   // Testable
   function calculateDiscount(cart): Discount {}

   // Hard to test
   function applyDiscount(cart): void {
     cart.total -= discount;
   }
   ```

3. **Return results, don't produce side effects**

   ```typescript
   // Testable
   function calculateDiscount(cart): Discount {}

   // Hard to test
   function applyDiscount(cart): void {
     cart.total -= discount;
   }
   ```

4. **Async interfaces: return Promises consistently**

   If a function can be async, always return a `Promise`. Mixing sync and async in the same interface forces callers (and tests) to handle both shapes.

   ```typescript
   // Testable — always a Promise
   async function fetchConfig(path: string): Promise<Config> { … }

   // Hard to test — sometimes sync, sometimes async
   function fetchConfig(path: string): Config | Promise<Config> { … }
   ```

5. **Use Result types for recoverable errors**

   When callers are expected to handle failure, return a `Result<T, E>` instead of throwing. This makes error paths explicit in the type system and in tests.

   ```typescript
   import { type Result, ok, err } from "neverthrow";

   // Testable — success and failure are both values
   async function loadConfig(path: string): Promise<Result<Config, ConfigError>> {
     if (!(await fileExists(path))) {
       return err(configError("File not found", path));
     }
     return ok(parseConfig(await readFile(path)));
   }

   // Hard to test — error path is hidden in throw/catch
   async function loadConfig(path: string): Promise<Config> {
     if (!(await fileExists(path))) {
       throw new ConfigError("File not found");
     }
     return parseConfig(await readFile(path));
   }
   ```

   Why `Result` is better for testability:
   - Tests can assert on `result.isOk()` and `result.isErr()` as ordinary values
   - No need for `try/catch` or `expect(fn).rejects.toThrow()` boilerplate
   - The compiler forces callers to handle both paths
   - Error shape is part of the type contract

6. **Small surface area**
   - Fewer methods = fewer tests needed
   - Fewer params = simpler test setup
