# ADR-0001: One Issue Per Iteration

## Status

Accepted

## Context

The Implementer agent was discovering issues from the issue tracker and sometimes attempted to resolve multiple ready-for-agent issues in a single session. This produced large, unfocused diffs that were harder to review, harder to attribute to specific issues, and increased the risk of merge conflicts or incomplete work.

We needed a scope constraint that kept each iteration focused and traceable without coupling the orchestrator to any particular issue tracker (GitHub, GitLab, Jira, local markdown, etc.).

## Decision

The Implementer must implement exactly **one** ready-for-agent issue per session.

- The Implementer discovers the highest-priority ready issue using the tracker conventions described in the Project Agent Configuration.
- It implements that issue fully, commits the changes, updates the issue's status in the tracker (e.g., removes the ready-for-agent label, closes it, or adds a completion comment), and then stops.
- The prompt explicitly states this constraint. No orchestrator-side issue querying is performed.
- After finishing, the Implementer outputs `<promise>NEXT</promise>` (more ready issues remain) or `<promise>COMPLETE</promise>` (no ready issues remain).

## Consequences

**Positive:**
- Each iteration produces a focused, reviewable unit of work tied to a single issue.
- The loop remains tracker-agnostic; projects can swap issue systems without touching the loop code.
- Issue attribution is preserved in commit messages and tracker history.

**Negative:**
- The Implementer must be trusted to self-enforce the constraint. A misbehaving model could still attempt multiple issues.
- The loop cannot proactively validate that the "right" issue was picked; it only sees the resulting commits and completion signal.

## Related

- `CONTEXT.md` — Iteration, Implementer, Issue Tracker, Ready-for-agent Label
- `src/prompts/implement-prompt.ts`
