# Agent Loop

An orchestration script that delegates feature development to autonomous AI agents using git worktrees for isolation. Each iteration creates an Implementer agent to write changes and a Reviewer agent to refine them, then merges the result back to the source branch.

## Language

**Agent Loop**:
The orchestration process that runs iterations of implementer and reviewer until the task is complete or max iterations are reached.

**Iteration**:
One complete cycle consisting of: worktree creation, Implementer execution, Reviewer execution, merge to source branch, and cleanup.

**Implementer**:
An AI agent session whose role is to read the prompt and make code changes in the worktree.
_Avoid_: Writer, coder, developer

**Reviewer**:
An AI agent session whose role is to review the Implementer's changes and refine or fix issues.
_Avoid_: Checker, linter, auditor

**Worktree**:
A git worktree directory created from the source branch, used to isolate one iteration's changes.
_Avoid_: Workspace, sandbox, temp directory

**Source Branch**:
The branch the user is actively developing on. Iteration branches are created from this branch and merged back into it.
_Avoid_: Feature branch, working branch

**Target Branch**:
The branch the final PR should target. Typically `main`.
_Avoid_: Base branch, destination branch

**Completion Signal**:
A tag (`<promise>NEXT</promise>` or `<promise>COMPLETE</promise>`) output by the Implementer to tell the loop whether to continue or stop.
_Avoid_: Status, flag, indicator

**Prompt**:
The instruction text given to an AI agent session. The project provides default prompt files; users may edit them but do not create them from scratch.
_Avoid_: Instructions, task description, query

**Config**:
An optional TypeScript file (`agent-loop.config.ts`) that overrides hardcoded defaults. If absent, the script uses sensible defaults for all settings.
_Avoid_: Settings, configuration, options

**Model**:
The AI model assigned to an agent role, specified in `provider/model` format (e.g. `opencode/kimi-k2.6`, `openrouter/anthropic/claude-sonnet-4`). The provider determines which backend serves the model.
_Avoid_: Engine, backend, AI model

## Flagged ambiguities

- "Branch" without qualification could mean Source Branch, Target Branch, or an iteration branch. Always disambiguate.
- "Agent" without qualification could mean Implementer or Reviewer. Use the specific role name.

## Example dialogue

> **Dev**: What happens when the Implementer outputs `<promise>COMPLETE</promise>`?
>
> **Expert**: The Reviewer still runs its phase, but after merging, the loop stops. No more iterations are created.
>
> **Dev**: And if the Implementer outputs nothing?
>
> **Expert**: It logs a warning but continues anyway — the current behavior is defensive. The loop only stops on explicit `<promise>COMPLETE</promise>` or when `maxIterations` is reached.
>
> **Dev**: What if the Reviewer finds a bug the Implementer introduced?
>
> **Expert**: The Reviewer can fix it directly in the worktree. Both agents' changes are merged together into the source branch as one unit of work.
>
> **Dev**: Can I run multiple Agent Loops on the same repo at the same time?
>
> **Expert**: Yes — each iteration uses its own git worktree, so they're fully isolated. But you should ensure each loop uses a different source branch to avoid merge conflicts when they finish.
