# Agent Loop for Opencode

An autonomous agent loop that delegates feature development to AI agents via the [Opencode](https://opencode.ai/) SDK. Each iteration creates a fresh git worktree, runs an Implementer agent to write changes and a Reviewer agent to refine them, then merges the result back to your source branch. The loop repeats until the task is complete or the maximum number of iterations is reached.

## Requirements

- [Opencode](https://opencode.ai/) CLI installed and authenticated
- [Bun](https://bun.sh/) runtime
- Git repository with an `AGENTS.md` file
- Optional: `agent-loop.config.ts` for custom configuration

## Installation

Run directly from GitHub without installing:

```sh
bunx github:fveracoechea/agent-loop
```

## Usage

### 1. Configure (optional)

Create an `agent-loop.config.ts` in your project root to override defaults:

```typescript
export default {
  sourceBranch: "main",      // Branch you are developing on (default: current branch)
  targetBranch: "main",      // Branch for the final PR (default: "main")
  maxIterations: 10,         // Maximum loop iterations (default: 10)
  worktreesDir: "agent-loop/worktrees", // Where worktrees are created
  implementer: {
    model: "opencode/kimi-k2.6",          // Model for the Implementer agent
    promptPath: "./agent-loop/implement-prompt.md", // Custom implementer prompt
  },
  reviewer: {
    model: "opencode/claude-sonnet-4-6",  // Model for the Reviewer agent
    promptPath: "./agent-loop/review-prompt.md",      // Custom reviewer prompt
  },
};
```

### 2. Run

```sh
bunx github:fveracoechea/agent-loop
```

The loop will:

1. Verify you are on the source branch
2. For each iteration:
   - Create a new git worktree and branch
   - Start an Opencode server
   - **Implementer phase**: Run the Implementer agent to make code changes
   - Auto-commit any changes
   - **Reviewer phase**: Run the Reviewer agent to refine the changes
   - Auto-commit any changes
   - Merge the iteration branch back into the source branch
   - Clean up the worktree
3. Stop when the Implementer signals `<promise>COMPLETE</promise>` or max iterations are reached
4. Create a PR from the source branch to the target branch if there are changes

## Matt Pocock Skills Integration

This project builds on top of [mattpocock/skills](https://github.com/mattpocock/skills) and bundles the following skills into the workflow:

- **`/to-prd`** — Converts a feature idea into a structured Product Requirements Document (PRD). Use this to define what you want to build before running the Agent Loop.
- **`/to-issues`** — Breaks a PRD into independently-grabbable implementation issues. Helps organize work before the loop starts iterating.
- **`/grill-with-docs`** — Stress-tests a plan against the project's domain model, sharpens terminology, and updates `CONTEXT.md` and ADRs as decisions crystallize.

These skills help you prepare a well-specified task before the Agent Loop takes over the implementation.

## How It Works

Each iteration:

1. **Worktree creation**: A new git worktree and branch are created from the source branch to isolate changes.
2. **Implementer**: An AI agent session reads the implementer prompt and makes code changes in the worktree. It outputs a completion signal (`<promise>NEXT</promise>` or `<promise>COMPLETE</promise>`) to tell the loop whether to continue or stop.
3. **Auto-commit**: Any uncommitted changes from the Implementer are committed automatically.
4. **Reviewer**: A second AI agent session reviews the changes and refines or fixes issues.
5. **Auto-commit**: Any additional changes from the Reviewer are committed.
6. **Merge**: The iteration branch is merged back into the source branch.
7. **Cleanup**: The worktree is removed.

If no commits are made in an iteration, the loop skips the Reviewer phase. If the Implementer signals `<promise>COMPLETE</promise>`, the loop finishes after the current iteration. If something goes wrong, the worktree is preserved for manual inspection.

## Completion Signals

The Implementer agent can signal the loop's control flow by including one of these tags in its response:

- `<promise>NEXT</promise>` — Continue to the next iteration.
- `<promise>COMPLETE</promise>` — Stop the loop; the task is done.

If neither signal is present, the loop logs a warning and continues anyway.
