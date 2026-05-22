# Agent Loop for Opencode

An autonomous agent loop that delegates feature development to AI agents via the [Opencode](https://opencode.ai/) SDK. Each iteration creates a fresh git worktree, runs an Implementer agent to write changes and a Reviewer agent to refine them, then merges the result back to your source branch. The loop repeats until the task is complete or the maximum number of iterations is reached.

## Requirements

- [Opencode](https://opencode.ai/) CLI installed and authenticated
- [Bun](https://bun.sh/) runtime
- Git repository

**For issue tracker integration:**
- `AGENTS.md` and `docs/agents/` configured via [`/setup-matt-pocock-skills`](https://github.com/mattpocock/skills)
- Optional: `agent-loop.config.ts` for custom configuration

## Installation

Run directly from GitHub without installing:

```sh
bunx github:fveracoechea/agent-loop
```

## Usage

### 1. Set up your project's agent skills (required for issue tracker mode)

The Agent Loop is **convention-adaptive** — it does not hardcode commands like `bun test` or `gh issue list`. Instead, the loop injects your project's own documentation into each agent prompt, and the agents discover the correct conventions by reading it.

For this to work, your repo must document its conventions using the [mattpocock/skills](https://github.com/mattpocock/skills) framework:

**Required skill:**

- **`/setup-matt-pocock-skills`** — Run this once per repo. It scaffolds `docs/agents/issue-tracker.md`, `docs/agents/triage-labels.md`, and `docs/agents/domain.md`, and links them from `AGENTS.md`. Without this, the Implementer has no way to discover your issue tracker or the correct label for ready issues.

**Recommended skills:**

- **`/to-prd`** — Convert a feature idea into a structured Product Requirements Document (PRD). Do this before running the Agent Loop so the task is well-specified.
- **`/to-issues`** — Break a PRD into independently-grabbable vertical-slice issues. This creates the ready-for-agent issues the loop will pick up and implement.
- **`/grill-with-docs`** — Stress-test a plan against your domain model and update `CONTEXT.md` and ADRs. Use this when domain language or architecture decisions are unclear.

**Workflow:**

```
/to-prd        → Define what to build
/to-issues     → Slice into ready-for-agent tickets
Agent Loop     → Implements tickets automatically
```

### 2. Configure (optional)

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

### 3. Run

```sh
bunx github:fveracoechea/agent-loop
```

The loop will:

1. Verify you are on the source branch
2. Read your project's `AGENTS.md`, `docs/agents/`, `CONTEXT.md`, and manifest files
3. For each iteration:
   - Create a new git worktree and branch
   - Start an Opencode server
   - **Implementer phase**: The agent discovers your issue tracker conventions, fetches the next `ready-for-agent` issue, reads the acceptance criteria, implements the changes, runs the project's quality commands, and commits
   - Auto-commit any changes
   - **Reviewer phase**: The agent reviews the implementation against the issue's acceptance criteria, runs quality commands, and fixes issues
   - Auto-commit any changes
   - Merge the iteration branch back into the source branch
   - Clean up the worktree
4. Stop when the Implementer signals `<promise>COMPLETE</promise>` or max iterations are reached
5. Create a PR from the source branch to the target branch if there are changes

## How Convention-adaptive Prompts Work

Unlike tools that hardcode `bun test` or `gh issue list`, the Agent Loop's default prompts are **generic and self-directing**. Before each phase, the loop gathers the project's own documentation and injects it into the prompt as a `## Project Agent Configuration` section:

- **`AGENTS.md`** — Coding styles and conventions
- **`docs/agents/issue-tracker.md`** — Exact CLI commands for your issue tracker (GitHub, GitLab, local markdown, Jira, etc.)
- **`docs/agents/triage-labels.md`** — Mapping of canonical labels to your actual label strings
- **`docs/agents/domain.md`** — How to consume `CONTEXT.md` and ADRs
- **`CONTEXT.md`** — Domain glossary and concepts
- **`package.json` scripts** (or other manifest) — Available build/test/lint commands

The agent reads this context and acts accordingly. This means:

- **GitHub repo?** The agent uses `gh issue list` with the label mapped in `triage-labels.md`.
- **GitLab repo?** The agent uses `glab` commands instead.
- **Local markdown tracker?** The agent reads `.scratch/` files.
- **Rust project?** The agent discovers `cargo test` and `cargo clippy` from the manifest.
- **Python project?** The agent discovers `pytest` and `ruff` from `pyproject.toml`.

You can customize the prompt files (`agent-loop/implement-prompt.md`, `agent-loop/review-prompt.md`) to add role-specific instructions, but you do not need to hardcode toolchain commands — the agent discovers them from your project's own docs.

## How It Works

Each iteration:

1. **Worktree creation**: A new git worktree and branch are created from the source branch to isolate changes.
2. **Context gathering**: The loop reads `AGENTS.md`, `docs/agents/`, `CONTEXT.md`, and manifest files, injecting them into the prompt.
3. **Implementer**: An AI agent session reads the implementer prompt and the Project Agent Configuration. It discovers the issue tracker, fetches the next ready issue, implements the changes, runs the project's quality commands, and commits. It outputs a completion signal (`<promise>NEXT</promise>` or `<promise>COMPLETE</promise>`) to tell the loop whether to continue or stop.
4. **Auto-commit**: Any uncommitted changes from the Implementer are committed automatically.
5. **Reviewer**: A second AI agent session reads the reviewer prompt and the Project Agent Configuration. It reviews the changes against the issue's acceptance criteria, runs quality commands, and fixes issues.
6. **Auto-commit**: Any additional changes from the Reviewer are committed.
7. **Merge**: The iteration branch is merged back into the source branch.
8. **Cleanup**: The worktree is removed.

If no commits are made in an iteration, the loop skips the Reviewer phase. If the Implementer signals `<promise>COMPLETE</promise>`, the loop finishes after the current iteration. If something goes wrong, the worktree is preserved for manual inspection.

## Completion Signals

The Implementer agent can signal the loop's control flow by including one of these tags in its response:

- `<promise>NEXT</promise>` — Continue to the next iteration.
- `<promise>COMPLETE</promise>` — Stop the loop; the task is done.

If neither signal is present, the loop logs a warning and continues anyway.
