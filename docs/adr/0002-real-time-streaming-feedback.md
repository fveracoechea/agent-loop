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

## Related

- `CONTEXT.md` — Streamed Output, Phase Prefix, Iteration
- `src/sdk.ts` — `runAgentPromptStreamed()`
- `src/index.ts` — orchestration with streaming and summary
