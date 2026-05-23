import path from "node:path";

/**
 * Resolves an absolute worktree path from a (possibly relative) baseDir,
 * the original working directory, and a timestamp.
 */
export function resolveWorktreePath(
	baseDir: string,
	originalCwd: string,
	timestamp: number,
): string {
	return path.resolve(originalCwd, baseDir, String(timestamp));
}
