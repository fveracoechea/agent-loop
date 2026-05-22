import { $ } from "bun";

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const MAX_ITERATIONS = 10;

const IMPLEMENTER_MODEL = "opencode/kimi-k2.6";
const REVIEWER_MODEL = "opencode/claude-sonnet-4-6";

const IMPLEMENT_PROMPT_PATH = "./ralph/implement-prompt.md";
const REVIEW_PROMPT_PATH = "./ralph/review-prompt.md";

const WORKTREES_DIR = "ralph/worktrees";
const DEFAULT_TARGET_BRANCH = "main";

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

function parseArgs() {
  const args = process.argv.slice(2);

  const flag = args.at(0);
  const sourceBranch = args.at(1);

  if (flag === "--source-branch" && sourceBranch) {
    return { sourceBranch };
  }

  return { sourceBranch: null };
}

// ---------------------------------------------------------------------------
// Git helpers
// ---------------------------------------------------------------------------

async function getCurrentBranch(): Promise<string> {
  const result = await $`git branch --show-current`.nothrow().quiet();
  return result.stdout.toString().trim();
}

async function createWorktree(
  path: string,
  branch: string,
  baseBranch: string,
): Promise<void> {
  await $`git worktree add -b ${branch} ${path} ${baseBranch}`.quiet();
}

async function removeWorktree(path: string, branch: string): Promise<void> {
  await $`git worktree remove ${path}`.nothrow().quiet();
  await $`git branch -D ${branch}`.nothrow().quiet();
}

async function hasUncommittedChanges(worktreePath: string): Promise<boolean> {
  const result = await $`git status --porcelain`.cwd(worktreePath).nothrow().quiet();
  return result.stdout.toString().trim().length > 0;
}

async function autoCommit(worktreePath: string, message: string): Promise<void> {
  const hasChanges = await hasUncommittedChanges(worktreePath);
  if (!hasChanges) return;

  console.log(`Auto-committing uncommitted changes: ${message}`);
  await $`git add -A`.cwd(worktreePath).quiet();
  await $`git commit -m ${message}`.cwd(worktreePath).nothrow().quiet();
}

async function hasCommits(branch: string, baseBranch: string): Promise<boolean> {
  const result = await $`git log ${baseBranch}..${branch} --oneline`.nothrow().quiet();
  return result.stdout.toString().trim().length > 0;
}

async function getCommitLog(branch: string, baseBranch: string): Promise<string> {
  const result = await $`git log ${baseBranch}..${branch} --oneline`.nothrow().quiet();
  return result.stdout.toString().trim();
}

async function mergeToSource(
  iterationBranch: string,
  _sourceBranch: string,
): Promise<boolean> {
  const result = await $`git merge ${iterationBranch}`.nothrow().quiet();
  return result.exitCode === 0;
}

async function branchAheadOfTarget(
  sourceBranch: string,
  targetBranch: string,
): Promise<boolean> {
  const result = await $`git log ${targetBranch}..${sourceBranch} --oneline`.nothrow().quiet();
  return result.stdout.toString().trim().length > 0;
}

async function createPR(sourceBranch: string, targetBranch: string): Promise<void> {
  const result =
    await $`gh pr create --base ${targetBranch} --head ${sourceBranch} --title "RALPH: Automated changes" --body "Automated changes by Ralph agent."`.nothrow();
  if (result.exitCode !== 0) {
    console.warn(
      `Failed to create PR. Create it manually with: gh pr create --base ${targetBranch} --head ${sourceBranch}`,
    );
  }
}

// ---------------------------------------------------------------------------
// Prompt expansion — pre-execute !`command` directives
// ---------------------------------------------------------------------------

async function expandPromptCommands(prompt: string): Promise<string> {
  const commandPattern = /!`([^`]+)`/g;
  let result = prompt;

  const matches = [...prompt.matchAll(commandPattern)];
  for (const match of matches) {
    const [fullMatch, command] = match;
    console.log(`Running: ${command}`);
    const cmdResult = await $`${{ raw: command }}`.nothrow().quiet();
    const output = cmdResult.stdout.toString() + cmdResult.stderr.toString();
    if (cmdResult.exitCode !== 0) {
      console.warn(`Command failed with exit code ${cmdResult.exitCode}: ${command}`);
    }
    result = result.replace(fullMatch, output.trim());
  }

  return result;
}

// ---------------------------------------------------------------------------
// Main loop
// ---------------------------------------------------------------------------

let { sourceBranch } = parseArgs();

if (!sourceBranch) {
  sourceBranch = await getCurrentBranch();
  if (!sourceBranch) {
    console.error("Error: Could not detect current branch and no --source-branch provided.");
    process.exit(1);
  }
  console.log(`Using current branch: ${sourceBranch}`);
}

// Ensure worktrees directory exists
await $`mkdir -p ${WORKTREES_DIR}`.quiet();

for (let iteration = 1; iteration <= MAX_ITERATIONS; iteration++) {
  const branch = `ralph/${Date.now()}`;
  const worktreePath = `${WORKTREES_DIR}/${Date.now()}`;

  console.log(`\n=== Iteration ${iteration}/${MAX_ITERATIONS} ===`);
  console.log(`Branch: ${branch}`);
  console.log(`Worktree: ${worktreePath}\n`);

  // Create worktree from source branch
  try {
    await createWorktree(worktreePath, branch, sourceBranch);
  } catch {
    console.error(`Failed to create worktree for branch ${branch}. Aborting.`);
    break;
  }

  let iterationFailed = false;

  try {
    // -----------------------------------------------------------------------
    // Phase 1: Implement
    // -----------------------------------------------------------------------

    const implementTemplate = await Bun.file(IMPLEMENT_PROMPT_PATH).text();
    const implementPrompt = await expandPromptCommands(implementTemplate);
    const implementTitle = `ralph-implement-${iteration}`;

    console.log("Running implementer...");

    const implementResult =
      await $`opencode run -m ${IMPLEMENTER_MODEL} --title ${implementTitle} --dir ${worktreePath} ${implementPrompt}`.nothrow();
    const implementOutput =
      implementResult.stdout.toString() + implementResult.stderr.toString();
    const isNext = implementOutput.includes("<promise>NEXT</promise>");
    const isComplete = implementOutput.includes("<promise>COMPLETE</promise>");

    if (implementResult.exitCode !== 0) {
      console.warn(`Warning: Implementer exited with code ${implementResult.exitCode}`);
    }

    // Auto-commit any uncommitted changes
    await autoCommit(
      worktreePath,
      `RALPH: auto-commit implementer changes [iteration ${iteration}]`,
    );

    // Check commits
    const hasImplCommits = await hasCommits(branch, sourceBranch);

    if (!hasImplCommits) {
      console.log("No commits made. Skipping review.");

      if (isComplete) {
        console.log("Implementer signaled completion. All issues resolved.");
        break;
      }

      continue;
    }

    console.log(`Commits:\n${await getCommitLog(branch, sourceBranch)}`);

    // -----------------------------------------------------------------------
    // Phase 2: Review
    // -----------------------------------------------------------------------

    const reviewTemplate = await Bun.file(REVIEW_PROMPT_PATH).text();
    const reviewPrompt = await expandPromptCommands(reviewTemplate);

    const reviewTitle = `ralph-review-${iteration}`;

    console.log("Running reviewer...");

    const reviewResult =
      await $`opencode run -m ${REVIEWER_MODEL} --title ${reviewTitle} --dir ${worktreePath} ${reviewPrompt}`.nothrow();

    if (reviewResult.exitCode !== 0) {
      console.warn(`Warning: Reviewer exited with code ${reviewResult.exitCode}`);
    }

    // Auto-commit any uncommitted changes
    await autoCommit(
      worktreePath,
      `RALPH: auto-commit reviewer changes [iteration ${iteration}]`,
    );

    // -----------------------------------------------------------------------
    // Merge iteration branch back to source
    // -----------------------------------------------------------------------

    const mergeSuccess = await mergeToSource(branch, sourceBranch);
    if (!mergeSuccess) {
      console.error(
        `Merge of ${branch} into ${sourceBranch} failed. Preserving worktree for inspection.`,
      );
      iterationFailed = true;
      break;
    }

    console.log(`Merged ${branch} into ${sourceBranch}`);

    // -----------------------------------------------------------------------
    // Stop condition
    // -----------------------------------------------------------------------

    if (isComplete) {
      console.log("Implementer signaled completion. All issues resolved.");
      break;
    }

    if (!isNext && !isComplete) {
      console.warn(
        "Warning: Implementer did not output <promise>NEXT</promise> or <promise>COMPLETE</promise>. Continuing anyway.",
      );
    }

    console.log("Iteration complete. Continuing...");
  } finally {
    // -----------------------------------------------------------------------
    // Cleanup worktree
    // -----------------------------------------------------------------------
    if (!iterationFailed) {
      console.log("Removing worktree...");
      await removeWorktree(worktreePath, branch);
    } else {
      console.log(`Worktree preserved at: ${worktreePath}`);
      console.log(
        `Clean up manually with: git worktree remove ${worktreePath} && git branch -D ${branch}`,
      );
    }
  }
}

// ---------------------------------------------------------------------------
// Final PR
// ---------------------------------------------------------------------------

console.log("\nRalph finished.");

const hasChanges = await branchAheadOfTarget(sourceBranch, DEFAULT_TARGET_BRANCH);
if (hasChanges) {
  console.log(`\nCreating PR from ${sourceBranch} to ${DEFAULT_TARGET_BRANCH}...`);
  await createPR(sourceBranch, DEFAULT_TARGET_BRANCH);
} else {
  console.log("\nNo changes to create a PR for.");
}
