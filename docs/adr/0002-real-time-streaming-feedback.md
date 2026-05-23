# ADR-0002: Real-Time Streaming Feedback

## Status

Accepted

## Context

Previously, the loop ran the Implementer and Reviewer via blocking `session.prompt()` calls. The user saw no output until the entire agent response was finished, leaving minutes (or longer) of silence with no indication of progress. This was especially frustrating during long-running agent sessions.

We wanted two things:
1. **Structured progress logging** — clear phase boundaries so the user knows what is happening.
2. **Real-time streaming** — live output of the agent's text/reasoning as it generates, so the user can observe progress and spot problems early.

## Decision

Replace blocking `session.prompt()` with an async streaming pipeline for both Implementer and Reviewer phases.

### Streaming mechanism

1. Fire the prompt via `session.promptAsync()` (returns immediately, 204).
2. Subscribe to the global event stream via `event.subscribe()`.
3. Iterate the SSE `AsyncGenerator` until the stream naturally closes.
4. For each `message.part.updated` event:
   - Filter to the current session ID (ignore events from other sessions).
   - Only process `text` and `reasoning` part types.
   - Print the `delta` to the terminal with a phase prefix: `[Implementer]` or `[Reviewer]`.
5. After the stream closes, fetch the authoritative final message via `session.messages()` to get the complete text for completion-signal parsing.

### Error handling

If the event stream errors at any point, the iteration aborts immediately (fail-fast). The worktree is preserved for inspection. No fallback to blocking mode is attempted.

### Structured logging

Phase-boundary log messages are added to the orchestrator:
- `🔨 Implementer started`
- `📋 Implementer finished`
- `🔍 Reviewer started`
- `📋 Reviewer finished`

### Iteration summary

After merging the iteration branch back to the source branch, a concise summary is printed:
- Signal received (`NEXT` / `COMPLETE` / none)
- Number of commits
- Commit log
- Merge status

## Consequences

**Positive:**
- Users get immediate, continuous feedback instead of silent waiting.
- Streaming is non-invasive to the agent's behavior; the same prompt produces the same result.
- The phase prefix makes it easy to distinguish which agent is generating output.
- The iteration summary gives a clear checkpoint of what was accomplished.

**Negative:**
- The SSE event stream is an additional failure point. Network or server errors during streaming will abort the entire iteration.
- Requires the SDK's `event.subscribe()` endpoint to be available and stable.
- Raw deltas may include partial sentences or reasoning fragments, which can look messy to a human observer.

## Addendum: Silent Output Fix (2026-05-23)

### Problem

After deploying ADR-0002, the loop showed only phase-boundary logs (`🔨 Implementer started` / `📋 Implementer finished`) with total silence between. The opencode TUI on the same SDK showed full progress, so the SDK was emitting events but the consumer was missing them.

### Root causes

1. **Race condition:** `client.global.event({})` was subscribed *after* `session.promptAsync()` fired. With no SSE replay, early deltas were lost.
2. **Filter mismatch:** The consumer only processed `text` and `reasoning` part types. When the agent emitted only `tool` and `step-start` parts mid-flight, nothing was printed until the final text appeared at the end.
3. **Per-token spam:** Text deltas were printed immediately with `console.log`, producing noisy, partial-line output.

### Fix

1. **Subscribe before prompt:** Reordered `client.global.event({})` before `client.session.promptAsync()` so the stream is ready before any events fire.
2. **Render tool & step parts:** Added minimal one-line rendering:
   - `step-start` → `[Implementer] ▶ step started`
   - `tool` running → `[Implementer] 🔧 <tool>: <title>`
   - `tool` completed → `[Implementer] ✓ <tool> done`
   - `tool` error → `[Implementer] ✗ <tool>: <error>`
3. **Buffer text/reasoning deltas:** Deltas are accumulated per `part.id` and flushed only on newline (or part transition / stream end). This eliminates per-token spam while preserving real-time visibility.
4. **Diagnostic trace:** Added `DEBUG=1` gated trace logging inside `runAgentPromptStreamed` for future event inspection.

### Updated streaming mechanism

1. Subscribe to global events via `client.global.event({})`.
2. Fire the prompt via `client.session.promptAsync()`.
3. Iterate the SSE `AsyncGenerator`.
4. For each `message.part.updated` event:
   - Filter to the current session ID.
   - `text` / `reasoning`: buffer the `delta`, flush complete lines on `\n`.
   - `step-start` / `tool`: flush any pending text buffers, then print one-line status.
5. After the stream closes, flush remaining buffers, then fetch authoritative final messages via `session.messages()`.

## Related

- `CONTEXT.md` — Streamed Output, Phase Prefix, Iteration
- `src/sdk.ts` — `runAgentPromptStreamed()`
- `src/index.ts` — orchestration with streaming and summary
