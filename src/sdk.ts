import type { OpencodeClient, ToolPart } from "@opencode-ai/sdk";
import { createOpencode } from "@opencode-ai/sdk";
import { err, ok, type Result } from "neverthrow";
import { type SdkError, sdkError } from "./errors";

export type { OpencodeClient };

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
				return server.close();
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

export async function runAgentPromptStreamed(
	client: OpencodeClient,
	sessionId: string,
	model: string,
	prompt: string,
	phase: AgentPhase,
): Promise<Result<string, SdkError>> {
	try {
		const { providerID, modelID } = parseModel(model);
		const label = phase === "implementer" ? "Implementer" : "Reviewer";
		const isDebug = process.env.DEBUG === "1";

		// Subscribe BEFORE starting the prompt to avoid missing early events
		const { stream } = await client.global.event({});

		// Start the prompt asynchronously
		await client.session.promptAsync({
			path: { id: sessionId },
			body: {
				model: { providerID, modelID },
				parts: [{ type: "text", text: prompt }],
			},
		});

		// Accumulate streamed text as fallback
		let accumulatedText = "";

		// Buffer text/reasoning deltas per part.id, flush on newline
		const textBuffers = new Map<string, string>();

		function flushAllBuffers(): void {
			for (const buffer of textBuffers.values()) {
				if (buffer.length > 0) {
					console.log(`[${label}] ${buffer}`);
				}
			}
			textBuffers.clear();
		}

		function trace(...args: unknown[]): void {
			if (isDebug) {
				console.error("[trace]", ...args);
			}
		}

		// Stream events and print deltas
		for await (const rawEvent of stream) {
			// Unwrap GlobalEvent payload if needed
			const event =
				rawEvent && typeof rawEvent === "object" && "payload" in rawEvent
					? (rawEvent as { payload: unknown }).payload
					: rawEvent;

			if (
				event &&
				typeof event === "object" &&
				"type" in event &&
				"properties" in event &&
				event.properties &&
				typeof event.properties === "object"
			) {
				// Handle session idle — agent finished processing
				if (event.type === "session.idle") {
					const idleProps = event.properties as {
						sessionID?: string;
					};
					if (idleProps.sessionID === sessionId) {
						break;
					}
					continue;
				}

				// Handle message part updates
				if (
					event.type === "message.part.updated" &&
					"part" in event.properties
				) {
					const properties = event.properties as {
						part: { sessionID?: string; type?: string; id?: string };
						delta?: string;
					};

					const part = properties.part;
					const delta = properties.delta;

					trace(
						`type=${event.type} partType=${part.type} partSession=${part.sessionID} match=${part.sessionID === sessionId} hasDelta=${typeof delta === "string"}`,
					);

					if (part.sessionID !== sessionId) continue;

					if (part.type === "text" || part.type === "reasoning") {
						if (typeof delta === "string" && delta.length > 0) {
							accumulatedText += delta;

							let buffer = textBuffers.get(part.id ?? "") ?? "";
							buffer += delta;

							let newlineIndex = buffer.indexOf("\n");
							while (newlineIndex !== -1) {
								const line = buffer.slice(0, newlineIndex);
								console.log(`[${label}] ${line}`);
								buffer = buffer.slice(newlineIndex + 1);
								newlineIndex = buffer.indexOf("\n");
							}

							textBuffers.set(part.id ?? "", buffer);
						}
					} else {
						// Non-text part — flush any pending text buffers first
						flushAllBuffers();

						if (part.type === "step-start") {
							console.log(`[${label}] ▶ step started`);
						} else if (part.type === "tool") {
							const toolPart = properties.part as unknown as ToolPart;
							const state = toolPart.state;

							if (state.status === "running") {
								const title = state.title ?? "";
								console.log(`[${label}] 🔧 ${toolPart.tool}: ${title}`);
							} else if (state.status === "completed") {
								console.log(`[${label}] ✓ ${toolPart.tool} done`);
							} else if (state.status === "error") {
								console.log(`[${label}] ✗ ${toolPart.tool}: ${state.error}`);
							}
						}
					}
				}
			}
		}

		flushAllBuffers();

		// Fetch final messages to get authoritative text
		const messagesResult = await client.session.messages({
			path: { id: sessionId },
		});

		const messages =
			messagesResult.data &&
			typeof messagesResult.data === "object" &&
			"messages" in messagesResult.data
				? (messagesResult.data as { messages: Array<unknown> }).messages
				: Array.isArray(messagesResult.data)
					? messagesResult.data
					: [];

		const assistantEntry = messages.find(
			(msg): msg is { info: { role: string }; parts: Array<unknown> } => {
				if (msg === null || typeof msg !== "object") return false;
				const record = msg as Record<string, unknown>;
				if (
					!("info" in record) ||
					typeof record.info !== "object" ||
					record.info === null
				)
					return false;
				const info = record.info as Record<string, unknown>;
				return "role" in info && info.role === "assistant";
			},
		);

		const parts = assistantEntry?.parts ?? [];
		const messagesText = parts
			.filter(
				(part): part is { type: string; text?: string } =>
					part !== null &&
					typeof part === "object" &&
					"type" in part &&
					(part.type === "text" || part.type === "reasoning"),
			)
			.map((part) => part.text)
			.filter((text): text is string => text !== undefined)
			.join("");

		// Use authoritative messages text if available, otherwise fall back to
		// accumulated streamed text
		return ok(messagesText || accumulatedText);
	} catch (cause) {
		const message = cause instanceof Error ? cause.message : String(cause);
		return err(sdkError(`Prompt failed: ${message}`, "session.promptAsync"));
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
