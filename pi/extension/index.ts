// Pi extension: shared agent-bank memory, forum and sandbox as tools, plus a memory digest and
// forum inbox injected into every run's system prompt.
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { basename } from "node:path";
import { execFileSync } from "node:child_process";
import { openBank, runSandboxed, KINDS, POST_KINDS } from "../../src/index.js";

type Model = { provider?: string; id?: string } | undefined;

/**
 * Which team member is speaking. BANK_AGENT wins (set by role launchers); otherwise derived from the
 * model. Unknown models map to 'local', the least-trusted identity (its memories need approval).
 */
export function agentFor(model: Model): string {
	const env = process.env.BANK_AGENT;
	if (env) return env;
	const provider = model?.provider ?? "";
	const id = model?.id ?? "";
	if (id.includes("argon")) return "argon";
	if (provider === "github-copilot") return "copilot";
	if (provider === "anthropic") return "claude";
	return "local";
}

/** Memory scope = BANK_SCOPE, else the git repo (or cwd) folder name. */
function scopeFor(cwd: string): string {
	if (process.env.BANK_SCOPE) return process.env.BANK_SCOPE;
	try {
		return basename(execFileSync("git", ["rev-parse", "--show-toplevel"], { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim());
	} catch {
		return basename(cwd);
	}
}

const text = (t: string, details?: unknown) => ({ content: [{ type: "text" as const, text: t }], details });
const fmt = (m: any) => `${m.id} [${m.kind}/${m.scope}${m.status === "active" ? "" : `/${m.status}`}] ${m.title}\n  ${m.body}`;

export default function agentBank(pi: ExtensionAPI) {
	let bank: ReturnType<typeof openBank> | undefined;
	const getBank = () => (bank ??= openBank());

	pi.on("before_agent_start", (event: any, ctx: any) => {
		const agent = agentFor(ctx.model);
		const scope = scopeFor(ctx.cwd);
		const b = getBank();
		const digest = b.memory.digest({ scope, limit: 40 });
		const inbox = b.forum.inbox(agent, { limit: 5 });
		event.systemPromptOptions.sections.agent_bank = [
			`## Agent bank (shared team memory)`,
			`You are team member **${agent}** (team: claude, argon, copilot, local, human). Memory scope: \`${scope}\`.`,
			`Use memory_search before re-deriving facts; memory_save for durable facts a future session needs (not task chatter, never secrets).`,
			`Use forum_post to hand off work or ask another member (@name); sandbox_run for untrusted commands.`,
			digest ? `### Active memories\n${digest}` : `### Active memories\n(none yet for this scope)`,
			inbox.length ? `### Forum inbox for @${agent}\n${inbox.map((p: any) => `- ${p.author} in "${p.thread_title}" (${p.thread_id}): ${p.body.slice(0, 200)}`).join("\n")}` : "",
		]
			.filter(Boolean)
			.join("\n\n");
	});

	pi.registerTool({
		name: "memory_search",
		label: "Memory search",
		description: "Full-text search the shared team memory bank (facts, decisions, preferences, references saved by any agent in earlier sessions).",
		promptSnippet: "Search shared team memory from earlier sessions",
		parameters: Type.Object({
			query: Type.String({ description: "Words to search for" }),
			scope: Type.Optional(Type.String({ description: "Project scope; defaults to the current project (global memories always included)" })),
			include_proposed: Type.Optional(Type.Boolean({ description: "Also return unreviewed memories proposed by the local model" })),
		}),
		async execute(_id, params: any, _signal, _onUpdate, ctx: any) {
			const res = getBank().memory.search(params.query, { scope: params.scope ?? scopeFor(ctx.cwd), includeProposed: params.include_proposed, limit: 10 });
			return text(res.length ? res.map(fmt).join("\n") : "No matching memories.", { count: res.length });
		},
	});

	pi.registerTool({
		name: "memory_save",
		label: "Memory save",
		description:
			"Save a durable fact to shared team memory so future sessions of any agent know it. Only for facts that outlive this task and cannot be re-derived from the code. Never secrets. Use supersedes to replace an outdated memory.",
		promptSnippet: "Save a durable fact to shared team memory",
		parameters: Type.Object({
			title: Type.String({ description: "Short title, under 12 words" }),
			body: Type.String({ description: "1-3 concrete sentences; include why it matters" }),
			kind: Type.Union(KINDS.map((k: string) => Type.Literal(k)), { description: "user | feedback | project | reference" }),
			tags: Type.Optional(Type.Array(Type.String())),
			scope: Type.Optional(Type.String({ description: "Defaults to the current project; use 'global' for cross-project facts" })),
			supersedes: Type.Optional(Type.String({ description: "id of a memory this replaces (it gets archived)" })),
		}),
		async execute(_id, params: any, _signal, _onUpdate, ctx: any) {
			// Author is the calling model, never a parameter: a model cannot claim to be 'claude' to skip review.
			const m = getBank().memory.save({ ...params, scope: params.scope ?? scopeFor(ctx.cwd), author: agentFor(ctx.model), source: "pi" });
			return text(`Saved ${m.id} (${m.status}${m.status === "proposed" ? " — needs approval by human/claude" : ""}).`, m);
		},
	});

	pi.registerTool({
		name: "forum_post",
		label: "Forum post",
		description: "Post to the team forum. Without thread_id it opens a new thread (title required). Mention teammates with @claude @argon @copilot @local @human so it lands in their inbox.",
		promptSnippet: "Hand off work or ask a teammate on the shared forum",
		parameters: Type.Object({
			body: Type.String(),
			thread_id: Type.Optional(Type.String()),
			title: Type.Optional(Type.String({ description: "Required when opening a new thread" })),
			channel: Type.Optional(Type.String({ description: "e.g. general, build, review, research" })),
			kind: Type.Optional(Type.Union(POST_KINDS.map((k: string) => Type.Literal(k)))),
		}),
		async execute(_id, params: any, _signal, _onUpdate, ctx: any) {
			const f = getBank().forum;
			const author = agentFor(ctx.model);
			if (params.thread_id) {
				const p = f.post({ threadId: params.thread_id, author, body: params.body, kind: params.kind });
				return text(`Posted ${p.id} in ${params.thread_id}${p.mentions.length ? `; notified @${p.mentions.join(" @")}` : ""}.`, p);
			}
			if (!params.title) throw new Error("title is required to open a new thread");
			const t = f.open({ title: params.title, channel: params.channel, author, body: params.body, kind: params.kind });
			return text(`Opened thread ${t.id} "${t.title}".`, t);
		},
	});

	pi.registerTool({
		name: "forum_read",
		label: "Forum read",
		description: "Read a forum thread by id, or with no id list your inbox (open threads mentioning you) and recent open threads.",
		parameters: Type.Object({ thread_id: Type.Optional(Type.String()), channel: Type.Optional(Type.String()) }),
		async execute(_id, params: any, _signal, _onUpdate, ctx: any) {
			const f = getBank().forum;
			if (params.thread_id) {
				const t = f.read(params.thread_id);
				return text(`${t.title} [${t.channel}, ${t.status}]\n${t.posts.map((p: any) => `--- ${p.author} (${p.kind}) ${p.created_at}\n${p.body}`).join("\n")}`, t);
			}
			const agent = agentFor(ctx.model);
			const inbox = f.inbox(agent);
			const threads = f.list({ channel: params.channel, limit: 15 });
			return text(
				`Inbox for @${agent}:\n${inbox.map((p: any) => `- ${p.thread_id} ${p.author}: ${p.body.slice(0, 160)}`).join("\n") || "(empty)"}\n\nOpen threads:\n${threads.map((t: any) => `- ${t.id} [${t.channel}] ${t.title} (${t.post_count} posts)`).join("\n") || "(none)"}`,
			);
		},
	});

	pi.registerTool({
		name: "sandbox_run",
		label: "Sandbox run",
		description:
			"Run a shell command in an isolated bubblewrap sandbox: no network, no home directory, no Windows drives, read-only system, one persistent writable workspace at /tmp/work. Use for untrusted code, downloaded scripts or experiments.",
		promptSnippet: "Run untrusted commands in an isolated sandbox",
		parameters: Type.Object({
			command: Type.String(),
			workspace: Type.Optional(Type.String({ description: "Workspace name (default 'default'); files persist between calls" })),
			timeout_sec: Type.Optional(Type.Number({ minimum: 1, maximum: 600 })),
		}),
		async execute(_id, params: any, signal) {
			const r = await runSandboxed(params.command, { workspace: params.workspace, timeoutMs: (params.timeout_sec ?? 60) * 1000, signal });
			return text(`exit ${r.code}${r.timedOut ? " (timed out)" : ""}\n--- stdout\n${r.stdout}\n--- stderr\n${r.stderr}`, { code: r.code, timedOut: r.timedOut, workspace: r.workspace });
		},
	});

	pi.registerCommand("bank", {
		description: "Show agent-bank memory digest and your forum inbox",
		handler: async (_args: string, ctx: any) => {
			const b = getBank();
			const agent = agentFor(ctx.model);
			const proposed = b.memory.list({ status: "proposed" }).length;
			ctx.ui.notify(`agent=${agent} scope=${scopeFor(ctx.cwd)} inbox=${b.forum.inbox(agent).length} proposed-to-review=${proposed}\n${b.memory.digest({ scope: scopeFor(ctx.cwd) }) || "(no memories)"}`, "info");
		},
	});
}
