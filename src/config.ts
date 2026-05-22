import { err, ok, type Result } from "neverthrow";
import { z } from "zod";
import { type ConfigError, configError } from "./errors";

// ---------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------

const agentConfigSchema = z.object({
	model: z
		.string()
		.regex(
			/\//,
			"Model must be in 'provider/model' format (e.g. 'opencode/kimi-k2.6')",
		)
		.default("opencode/kimi-k2.6"),
	promptPath: z.string().default("./agent-loop/implement-prompt.md"),
});

const configSchema = z.object({
	sourceBranch: z.string().optional(),
	targetBranch: z.string().default("main"),
	maxIterations: z.number().int().min(1).default(10),
	worktreesDir: z.string().default("agent-loop/worktrees"),
	implementer: agentConfigSchema.default({
		model: "opencode/kimi-k2.6",
		promptPath: "./agent-loop/implement-prompt.md",
	}),
	reviewer: agentConfigSchema.default({
		model: "opencode/claude-sonnet-4-6",
		promptPath: "./agent-loop/review-prompt.md",
	}),
});

export type Config = z.infer<typeof configSchema>;

// ---------------------------------------------------------------------------
// Defaults
// ---------------------------------------------------------------------------

export const DEFAULT_CONFIG: Config = {
	sourceBranch: undefined,
	targetBranch: "main",
	maxIterations: 10,
	worktreesDir: "agent-loop/worktrees",
	implementer: {
		model: "opencode/kimi-k2.6",
		promptPath: "./agent-loop/implement-prompt.md",
	},
	reviewer: {
		model: "opencode/claude-sonnet-4-6",
		promptPath: "./agent-loop/review-prompt.md",
	},
};

// ---------------------------------------------------------------------------
// Loader
// ---------------------------------------------------------------------------

const CONFIG_PATH = "./agent-loop.config.ts";

export async function loadConfig(): Promise<Result<Config, ConfigError>> {
	const file = Bun.file(CONFIG_PATH);

	if (!(await file.exists())) {
		return ok(DEFAULT_CONFIG);
	}

	try {
		const module = await import(/* @vite-ignore */ CONFIG_PATH);
		const raw = module.default;

		const resolved = typeof raw === "function" ? raw() : raw;

		const parsed = configSchema.safeParse(resolved);

		if (!parsed.success) {
			const issues = parsed.error.issues
				.map((i) => `${i.path.join(".")}: ${i.message}`)
				.join("; ");
			return err(configError(`Invalid config: ${issues}`, CONFIG_PATH));
		}

		return ok(parsed.data);
	} catch (cause) {
		const message = cause instanceof Error ? cause.message : String(cause);
		return err(configError(`Failed to load config: ${message}`, CONFIG_PATH));
	}
}
