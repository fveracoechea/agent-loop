import type { OpencodeClient } from "@opencode-ai/sdk";
import { createOpencode } from "@opencode-ai/sdk";
import { err, ok, type Result } from "neverthrow";
import { type SdkError, sdkError } from "./errors";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type AgentPhase = "implementer" | "reviewer";

export type CompletionSignal = "NEXT" | "COMPLETE" | null;

// ---------------------------------------------------------------------------
// Server lifecycle
// ---------------------------------------------------------------------------

export async function startServer(): Promise<
	Result<{ client: OpencodeClient; close: () => Promise<void> }, SdkError>
> {
	try {
		const { client, server } = await createOpencode();
		return ok({
			client,
			close: async () => {
				await server.close();
			},
		});
	} catch (cause) {
		const message = cause instanceof Error ? cause.message : String(cause);
		return err(
			sdkError(`Failed to start opencode server: ${message}`, "createOpencode"),
		);
	}
}

// ---------------------------------------------------------------------------
// Session management
// ---------------------------------------------------------------------------

export async function createSession(
	client: OpencodeClient,
): Promise<Result<string, SdkError>> {
	try {
		const session = await client.session.create({
			body: {},
		});
		if (!session.data?.id) {
			return err(sdkError("Session creation returned no ID", "session.create"));
		}
		return ok(session.data.id);
	} catch (cause) {
		const message = cause instanceof Error ? cause.message : String(cause);
		return err(
			sdkError(`Failed to create session: ${message}`, "session.create"),
		);
	}
}

export async function deleteSession(
	client: OpencodeClient,
	sessionId: string,
): Promise<Result<void, SdkError>> {
	try {
		await client.session.delete({ path: { id: sessionId } });
		return ok(undefined);
	} catch {
		// Ignore errors on delete — session may already be gone
		return ok(undefined);
	}
}

// ---------------------------------------------------------------------------
// Prompt execution
// ---------------------------------------------------------------------------

function parseModel(model: string): { providerID: string; modelID: string } {
	const idx = model.indexOf("/");
	if (idx === -1) {
		return { providerID: "opencode", modelID: model };
	}
	return {
		providerID: model.slice(0, idx),
		modelID: model.slice(idx + 1),
	};
}

export async function runAgentPrompt(
	client: OpencodeClient,
	sessionId: string,
	model: string,
	prompt: string,
): Promise<Result<string, SdkError>> {
	try {
		const { providerID, modelID } = parseModel(model);
		const result = await client.session.prompt({
			path: { id: sessionId },
			body: {
				model: { providerID, modelID },
				parts: [{ type: "text", text: prompt }],
			},
		});

		// Extract text from response parts
		const parts = result.data?.parts ?? [];
		const text = parts
			.filter((part) => part.type === "text")
			.map((part) => part.text)
			.join("");

		return ok(text);
	} catch (cause) {
		const message = cause instanceof Error ? cause.message : String(cause);
		return err(sdkError(`Prompt failed: ${message}`, "session.prompt"));
	}
}

// ---------------------------------------------------------------------------
// Completion signal parsing
// ---------------------------------------------------------------------------

export function parseCompletionSignal(output: string): CompletionSignal {
	if (output.includes("<promise>COMPLETE</promise>")) return "COMPLETE";
	if (output.includes("<promise>NEXT</promise>")) return "NEXT";
	return null;
}

// ---------------------------------------------------------------------------
// Context gathering
// ---------------------------------------------------------------------------

export type ProjectDoc = {
	path: string;
	content: string;
};

async function readProjectDoc(path: string): Promise<ProjectDoc | undefined> {
	const file = Bun.file(path);
	if (await file.exists()) {
		return { path, content: await file.text() };
	}
	return undefined;
}

async function readPackageScripts(): Promise<string | undefined> {
	const pkg = Bun.file("package.json");
	if (!(await pkg.exists())) return undefined;

	try {
		const json = await pkg.json();
		const scripts = json?.scripts;
		if (!scripts || Object.keys(scripts).length === 0) return undefined;

		const lines = Object.entries(scripts as Record<string, string>).map(
			([name, cmd]) => `  "${name}": "${cmd}"`,
		);
		return ["```json", '{"scripts": {', lines.join(",\n"), "}}", "```"].join(
			"\n",
		);
	} catch {
		return undefined;
	}
}

export async function gatherContext(): Promise<string> {
	const { $ } = await import("bun");

	const [statusResult, logResult] = await Promise.all([
		$`git status --short`.nothrow().quiet(),
		$`git log --oneline -5`.nothrow().quiet(),
	]);

	const status =
		statusResult.stdout.toString().trim() || "No uncommitted changes";
	const log = logResult.stdout.toString().trim() || "No commits";

	// Read project configuration docs
	const agentsMd = await readProjectDoc("AGENTS.md");
	const issueTrackerMd = await readProjectDoc("docs/agents/issue-tracker.md");
	const triageLabelsMd = await readProjectDoc("docs/agents/triage-labels.md");
	const domainMd = await readProjectDoc("docs/agents/domain.md");
	const contextMd = await readProjectDoc("CONTEXT.md");
	const packageScripts = await readPackageScripts();

	const sections: string[] = [
		"## Context",
		"",
		"### Git Status",
		"```",
		status,
		"```",
		"",
		"### Recent Commits",
		"```",
		log,
		"```",
		"",
	];

	if (agentsMd || issueTrackerMd || triageLabelsMd || domainMd || contextMd) {
		sections.push("## Project Agent Configuration", "");
	}

	function addDocSection(doc: ProjectDoc | undefined, title: string) {
		if (doc) {
			sections.push(`### ${title} (${doc.path})`, "", doc.content, "");
		} else {
			sections.push(
				`### ${title}`,
				"",
				"*(File not found — proceed without it.)*",
				"",
			);
		}
	}

	addDocSection(agentsMd, "AGENTS.md");
	addDocSection(issueTrackerMd, "Issue Tracker");
	addDocSection(triageLabelsMd, "Triage Labels");
	addDocSection(domainMd, "Domain Docs");
	addDocSection(contextMd, "CONTEXT.md");

	if (packageScripts) {
		sections.push(
			"### Available Scripts (package.json)",
			"",
			packageScripts,
			"",
		);
	}

	return sections.join("\n");
}
