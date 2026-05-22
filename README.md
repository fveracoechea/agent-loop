RESUME UPDATES:

- Expand more on AI dalily basis, AI driven proccess
- Expand more on UI/UX and product oriented drive
- Add my github with AI related stuff on it

# Ralph agent loop for Opencode

Ralph is an autonomous agent loop that runs AI via Opencode repeatedly until all
PRD items are complete. Each iteration is a fresh instance with clean context.
Memory persists via git history, `progress.txt`, and `prd.json`.

This version is optimized for **Web UI development**. Ralph uses the
[Playwriter](https://github.com/remorses/playwriter) skill to control a browser,
verify UI changes, take screenshots, and debug frontend issues autonomously.

![Simpsons character Ralph Wiggum typing on a computer](ralph.avif)

Based on [Geoffrey Huntley's Ralph pattern](https://ghuntley.com/ralph/).

## Requirements

- [Opencode](https://opencode.ai/)
- [jq](https://jqlang.org/)
- Git repository with an `AGENTS.md` file
- [Playwriter](https://github.com/remorses/playwriter) - Browser automation for
  UI verification (optional but recommended)

## Installation

Copy the skills and ralph folder to your project:

```sh
cp -r .opencode/skills/* /path/to/your/project/.opencode/skills/
cp -r ralph /path/to/your/project/
```

## Usage

### 1. Generate a PRD

```
Load the prd skill and create a PRD for [your feature description]
```

Answer the clarifying questions. Output saves to `tasks/prd-[feature-name].md`.

### 2. Convert to Ralph format

```
Load the ralph skill and convert tasks/prd-[feature-name].md to prd.json
```

### 3. Run Ralph

```sh
./ralph/ralph.sh                                     # Default: kimi-k2.5-free, 10 iterations
./ralph/ralph.sh --model opencode/kimi-k2.5          # Custom model
./ralph/ralph.sh --model github-copilot/claude-opus-4.5 20  # Custom model + iterations
```

## How It Works

Each iteration Ralph will:

1. Create/checkout the feature branch from `prd.json`
2. Pick the highest priority story where `passes: false`
3. Implement that single story
4. Run quality checks (typecheck, lint, test)
5. Commit if checks pass
6. Mark story as `passes: true` in `prd.json`
7. Append learnings to `ralph/progress.txt`
8. Repeat until complete or max iterations reached

## Browser Testing with Playwriter

For UI stories, Ralph uses Playwriter to verify changes in a real browser:

1. Start your dev server (e.g., `npm run dev`)

2. Ralph will automatically load the playwriter skill for UI stories, navigate
   to pages, interact with elements, and take screenshots to verify changes work
   as expected.
