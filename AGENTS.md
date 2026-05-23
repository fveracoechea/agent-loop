# Agent Guidelines

## Code Styles

- Make sure to run `bun lint:ci`, `bun typecheck` and `bun test` after code changes
- Prefer `function` keyword for named functions instead of arrow functions
- Functions and Modules must be modular, easy to ready, and easy to change
- Follow Red-Green Refactor using bun test runner
- Prefet bun's built-in functionality over node.js

## Agent skills

### Issue tracker

GitHub Issues in `fveracoechea/ralph-opencode` (uses the `gh` CLI). See `docs/agents/issue-tracker.md`.

### Triage labels

Default canonical labels: `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context layout — one `CONTEXT.md` + `docs/adr/` at the repo root. See `docs/agents/domain.md`.

## Architecture Decisions

- **ADR-0001**: One Issue Per Iteration — `docs/adr/0001-one-issue-per-iteration.md`
- **ADR-0002**: Real-Time Streaming Feedback — `docs/adr/0002-real-time-streaming-feedback.md`

