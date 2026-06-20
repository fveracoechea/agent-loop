#!/usr/bin/env bun
//
// Release script: cuts a semver tag and moves the `latest` tag to point at it.
//
// Usage:
//   bun scripts/release.ts <version>      # e.g. bun scripts/release.ts 0.1.0
//   bun scripts/release.ts patch          # bumps patch from current
//   bun scripts/release.ts minor          # bumps minor from current
//   bun scripts/release.ts major          # bumps major from current
//
// What it does:
//   1. Bumps package.json version
//   2. Commits "release vX.Y.Z"
//   3. Pushes main to origin
//   4. Creates tag vX.Y.Z and pushes it
//   5. Force-moves `latest` tag to the same commit and pushes it
//
// After release:
//   bunx github:fveracoechea/agent-loop#latest   # newest release
//   bunx github:fveracoechea/agent-loop#v0.1.0   # pinned

import { $ } from "bun";

type Bump = "patch" | "minor" | "major";

function parseVersion(v: string): [number, number, number] | null {
	const match = v.match(/^(\d+)\.(\d+)\.(\d+)$/);
	if (!match) return null;
	return [Number(match[1]), Number(match[2]), Number(match[3])];
}

function bumpVersion(
	current: [number, number, number],
	bump: Bump,
): [number, number, number] {
	const [major, minor, patch] = current;
	switch (bump) {
		case "major":
			return [major + 1, 0, 0];
		case "minor":
			return [major, minor + 1, 0];
		case "patch":
			return [major, minor, patch + 1];
	}
}

async function readPackageVersion(): Promise<string> {
	const pkg = await Bun.file("package.json").json();
	if (typeof pkg.version !== "string") {
		console.error("package.json has no version field");
		process.exit(1);
	}
	return pkg.version;
}

async function writePackageVersion(version: string): Promise<void> {
	const pkg = await Bun.file("package.json").json();
	pkg.version = version;
	await Bun.write("package.json", `${JSON.stringify(pkg, null, 2)}\n`);
}

async function main(): Promise<void> {
	const arg = process.argv[2];
	if (!arg) {
		console.error(
			"Usage: bun scripts/release.ts <version | patch | minor | major>",
		);
		process.exit(1);
	}

	const current = await readPackageVersion();
	const currentParsed = parseVersion(current);
	if (!currentParsed) {
		console.error(`Current version "${current}" is not valid semver`);
		process.exit(1);
	}

	let next: string;
	if (arg === "patch" || arg === "minor" || arg === "major") {
		next = bumpVersion(currentParsed, arg).join(".");
	} else {
		const parsed = parseVersion(arg.replace(/^v/, ""));
		if (!parsed) {
			console.error(
				`Invalid version "${arg}". Use a semver like "0.1.0" or a bump like "patch".`,
			);
			process.exit(1);
		}
		next = parsed.join(".");
	}

	const tag = `v${next}`;
	console.log(`Releasing ${tag} (current: v${current})`);

	// 1. Bump package.json
	await writePackageVersion(next);
	console.log(`✓ Bumped package.json to ${next}`);

	// 2. Commit
	await $`git add package.json`.quiet();
	const commitResult = await $`git commit -m ${`release ${tag}`}`
		.nothrow()
		.quiet();
	if (commitResult.exitCode !== 0) {
		console.error("Failed to commit release");
		console.error(commitResult.stderr.toString());
		process.exit(1);
	}
	console.log(`✓ Committed release ${tag}`);

	// 3. Push main
	const pushResult = await $`git push origin main`.nothrow().quiet();
	if (pushResult.exitCode !== 0) {
		console.error("Failed to push main");
		console.error(pushResult.stderr.toString());
		process.exit(1);
	}
	console.log("✓ Pushed main");

	// 4. Create semver tag
	await $`git tag -f ${tag}`.quiet();
	const pushTagResult = await $`git push origin ${tag}`.nothrow().quiet();
	if (pushTagResult.exitCode !== 0) {
		console.error(`Failed to push tag ${tag}`);
		console.error(pushTagResult.stderr.toString());
		process.exit(1);
	}
	console.log(`✓ Pushed tag ${tag}`);

	// 5. Move latest tag
	await $`git tag -f latest`.quiet();
	const pushLatestResult = await $`git push origin latest -f`.nothrow().quiet();
	if (pushLatestResult.exitCode !== 0) {
		console.error("Failed to push latest tag");
		console.error(pushLatestResult.stderr.toString());
		process.exit(1);
	}
	console.log("✓ Moved latest tag");

	console.log();
	console.log(`Released ${tag}`);
	console.log();
	console.log("Install with:");
	console.log(`  bunx github:fveracoechea/agent-loop#latest   # newest`);
	console.log(`  bunx github:fveracoechea/agent-loop#${tag}   # pinned`);
}

await main();
