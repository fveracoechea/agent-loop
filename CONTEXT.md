# Agent Loop

An orchestration script that delegates feature development to autonomous AI agents using git worktrees for isolation. Each iteration creates an Implementer agent to write changes and a Reviewer agent to refine them, then merges the result back to the source branch.

## Language

**Agent Loop**:
The orchestration process that runs iterations of implementer and reviewer until the task is complete or max iterations are reached.

**Iteration**:
One complete cycle consisting of: worktree creation, Implementer execution, Reviewer execution, merge to source branch, cleanup, and an Iteration Summary report.
_Avoid_: Cycle, round, pass

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

**Project Agent Configuration**:
The context section injected into every agent prompt, containing the project's `AGENTS.md`, `docs/agents/` files, `CONTEXT.md`, and manifest scripts. Agents use this to discover project conventions dynamically rather than relying on hardcoded assumptions.
_Avoid_: System prompt, context block, instructions

**Convention-adaptive**:
The property of agent prompts that instruct agents to read project documentation (e.g., `AGENTS.md`, `docs/agents/issue-tracker.md`, `package.json` scripts) to determine the correct commands, labels, and workflows rather than assuming a fixed toolchain.
_Avoid_: Dynamic, self-configuring

**Issue Tracker**:
The system where the project's tasks live (GitHub Issues, GitLab Issues, local markdown, Jira, etc.). The Implementer discovers how to interact with it by reading `docs/agents/issue-tracker.md` in the Project Agent Configuration.
_Avoid_: Ticket system, bug tracker, task manager

**Ready-for-agent Label**:
The label (or equivalent marker) that indicates an issue is fully specified and safe for an AFK agent to pick up. The actual string varies per project and is mapped in `docs/agents/triage-labels.md`.
_Avoid_: Ready label, agent-ready, todo

**Issue Scope**:
The constraint that the Implementer must resolve exactly one ready-for-agent issue per session. The Implementer discovers, implements, commits, and updates the tracker for a single issue before stopping.
_Avoid_: Batch, bulk, multi-issue

**Streamed Output**:
Real-time text and reasoning deltas printed to the terminal as the agent generates them, produced by subscribing to the SDK's SSE event stream during `promptAsync` execution.
_Avoid_: Live log,实时 output, progressive display

**Phase Prefix**:
The bracketed label (`[Implementer]` or `[Reviewer]`) prepended to each line of Streamed Output so the user knows which agent role produced it.
_Avoid_: Role tag, agent label, prefix marker

**Iteration Summary**:
A concise report printed after an iteration's merge, showing the Completion Signal, commit count, commit log, and merge status.
_Avoid_: Summary report, iteration log, wrap-up

## Flagged ambiguities

- "Branch" without qualification could mean Source Branch, Target Branch, or an iteration branch. Always disambiguate.
- "Agent" without qualification could mean Implementer or Reviewer. Use the specific role name.
- "Issue" without qualification could mean a GitHub issue, a local markdown issue, or a generic task. Clarify the tracker context.

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
>
> **Dev**: How does the Implementer know which test command to run?
>
> **Expert**: It doesn't hardcode `bun test`. Instead, the loop injects the project's `AGENTS.md`, `docs/agents/` files, and `package.json` scripts into the prompt as Project Agent Configuration. The agent reads those docs and discovers the correct commands itself.
>
> **Dev**: What if my project uses GitLab instead of GitHub for issues?
>
> **Expert**: The Implementer reads `docs/agents/issue-tracker.md` from the Project Agent Configuration. If that file describes GitLab conventions (using `glab`), the agent uses those commands. The loop is tracker-agnostic — it depends entirely on what the project documents about itself.
>
> **Dev**: How many issues does the Implementer handle in one iteration?
>
> **Expert**: Exactly one. The Implementer picks the highest-priority ready issue, implements it, commits, updates the tracker, and stops. It outputs `NEXT` if more ready issues exist, or `COMPLETE` if not.
>
> **Dev**: What do I see while the agents are running?
>
> **Expert**: Real-time streamed output. Each line is prefixed with `[Implementer]` or `[Reviewer]`, and you see text and reasoning deltas as they generate. When the stream closes, the loop prints an Iteration Summary with commits and signal.
>
> **Dev**: What happens if the streaming connection drops?
>
> **Expert**: The iteration aborts immediately. The worktree is preserved so you can inspect what happened. The loop does not silently retry or fall back to blocking mode.
