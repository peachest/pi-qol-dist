// src/extensions/qol.ts
import { join as join5 } from "node:path";

// src/scripts/lane-retention.ts
import { lstatSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
var LANE_FILE_MAX_AGE_MS = 5 * 24 * 60 * 60 * 1e3;
var LANE_CWD_FILE = ".lane-cwd";
function openLaneDir(dir, cwd) {
  mkdirSync(dir, { recursive: true, mode: 448 });
  writeFileSync(join(dir, LANE_CWD_FILE), cwd, { mode: 384 });
  return dir;
}
function message(error) {
  return error instanceof Error ? error.message : String(error);
}
function ownDirectory(path) {
  let stat;
  try {
    stat = lstatSync(path);
  } catch {
    return false;
  }
  const uid = process.getuid?.();
  return stat.isDirectory() && (uid === void 0 || stat.uid === uid);
}
function remove(path, result) {
  try {
    rmSync(path, { recursive: true, force: true });
    result.removed.push(path);
  } catch (error) {
    result.failed.push({ path, error: message(error) });
  }
}
function recordedCwd(dir) {
  try {
    const cwd = readFileSync(join(dir, LANE_CWD_FILE), "utf8");
    return cwd === "" ? void 0 : cwd;
  } catch {
    return void 0;
  }
}
function cwdState(dir, cwd, result) {
  try {
    statSync(cwd);
    return "present";
  } catch (error) {
    const code = error.code;
    if (code === "ENOENT" || code === "ENOTDIR") return "gone";
    result.failed.push({ path: dir, error: `lane-cwd-unchecked: the lane is kept; its working directory could not be checked: ${message(error)}` });
    return "unknown";
  }
}
function modifiedAt(path, result) {
  try {
    return lstatSync(path).mtimeMs;
  } catch (error) {
    result.failed.push({ path, error: message(error) });
    return void 0;
  }
}
function pruneOldFiles(dir, cutoff, result) {
  let remaining = 0;
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch (error) {
    result.failed.push({ path: dir, error: message(error) });
    return 1;
  }
  for (const entry of entries) {
    const path = join(dir, entry.name);
    if (entry.name === LANE_CWD_FILE) continue;
    if (entry.isDirectory()) {
      if (pruneOldFiles(path, cutoff, result) === 0) remove(path, result);
      else remaining++;
      continue;
    }
    const mtime = modifiedAt(path, result);
    if (mtime !== void 0 && mtime < cutoff) remove(path, result);
    else remaining++;
  }
  return remaining;
}
function pruneLanes(root, below = [], now = Date.now()) {
  const result = { removed: [], failed: [] };
  let entries;
  try {
    entries = readdirSync(root);
  } catch (error) {
    if (error.code !== "ENOENT") result.failed.push({ path: root, error: message(error) });
    return result;
  }
  if (!ownDirectory(root)) {
    result.failed.push({ path: root, error: "lane-root-not-owned: not a directory this user owns; nothing under it was pruned" });
    return result;
  }
  const cutoff = now - LANE_FILE_MAX_AGE_MS;
  for (const entry of entries) {
    let dir = root;
    let owned = true;
    for (const part of [entry, ...below]) {
      dir = join(dir, part);
      if (!ownDirectory(dir)) {
        owned = false;
        break;
      }
    }
    if (!owned) continue;
    const cwd = recordedCwd(dir);
    if (cwd === void 0) continue;
    const state = cwdState(dir, cwd, result);
    switch (state) {
      case "gone":
        remove(dir, result);
        continue;
      case "present":
      case "unknown":
        break;
      default: {
        const unhandled = state;
        throw new Error(`lane-cwd-state-unhandled: ${String(unhandled)}`);
      }
    }
    if (pruneOldFiles(dir, cutoff, result) > 0) continue;
    const recordAt = modifiedAt(join(dir, LANE_CWD_FILE), result);
    if (recordAt !== void 0 && recordAt < cutoff) remove(dir, result);
  }
  return result;
}

// src/extensions/qol.ts
import { truncateToWidth as truncateToWidth9 } from "@earendil-works/pi-tui";

// src/extensions/qol/agent-end.ts
function textFromContent(content) {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content.map((part) => {
    if (typeof part === "string") return part;
    if (part && typeof part === "object" && part.type === "text" && typeof part.text === "string") return part.text;
    return "";
  }).filter(Boolean).join("\n");
}
function lastAssistantTextFromAgentEnd(event, ctx) {
  const eventMessages = Array.isArray(event?.messages) ? event.messages : [];
  for (let index = eventMessages.length - 1; index >= 0; index -= 1) {
    const message2 = eventMessages[index];
    if (message2?.role === "assistant") return textFromContent(message2.content);
  }
  const branch = ctx.sessionManager.getBranch?.() ?? [];
  for (let index = branch.length - 1; index >= 0; index -= 1) {
    const entry = branch[index];
    if (entry?.type === "message" && entry.message?.role === "assistant") return textFromContent(entry.message.content);
  }
  return "";
}
function needsDirection(text) {
  return /\?\s*$|\b(let me know|tell me|which (one|option)|choose|confirm|approve|should i|would you like|do you want|need your input|awaiting|next step)\b/i.test(text);
}
function criticalInfo(text) {
  const match = text.match(/\b(critical|urgent|warning|blocked|cannot proceed|security|vulnerab|secret|credential|rate limit|context (overflow|full)|manual action required)\b/i);
  if (!match) return void 0;
  const line = text.split(/\r?\n/).find((candidate) => candidate.toLowerCase().includes(match[0].toLowerCase())) ?? text;
  return line.trim();
}
function taskStats(state) {
  const tasks = Array.isArray(state?.tasks) ? state.tasks : void 0;
  if (!tasks) return void 0;
  const total = tasks.length;
  const completed = tasks.filter((task) => task?.status === "completed").length;
  const remaining = tasks.filter((task) => task?.status === "pending" || task?.status === "in_progress").length;
  return { completed, remaining, total };
}

// src/extensions/qol/constants.ts
var INSTALL_SYMBOL = /* @__PURE__ */ Symbol.for("kendex.pi-qol.installed");
var CONFIG_ID = "@vanillagreen/pi-qol";
var STATUS_KEY = "qol-attachments";
var SESSION_SEARCH_STATUS_KEY = "qol-session-search";
var SESSION_SEARCH_CONTEXT_TYPE = "qol-session-context";
var CONTEXT_USAGE_MESSAGE_TYPE = "qol-context-usage";
var SESSION_MANAGER_STATUS_KEY = "session-manager";
var IMAGE_EXTENSIONS = /* @__PURE__ */ new Set([".png", ".jpg", ".jpeg", ".gif", ".webp", ".bmp", ".tif", ".tiff", ".heic", ".heif"]);
var IMAGE_PATH_PATTERN = /(^|[\s(\[{<"'`])(@?(?:~|\.\.?|\/)[^\s)\]}>"'`]+?\.(?:png|jpe?g|gif|webp|bmp|tiff?|heic|heif))(?=$|[\s)\]}>"'`,.;:!?])/gi;
var QUESTION_SERVICE_SYMBOL = /* @__PURE__ */ Symbol.for("kendex.pi-questions.service");
var QOL_NOTIFICATION_SERVICE_SYMBOL = /* @__PURE__ */ Symbol.for("kendex.pi-qol.notification-service");
var KENDEX_MODAL_LOCK_SYMBOL = /* @__PURE__ */ Symbol.for("kendex.pi.modal-lock");
var CAVEMAN_BRIDGE_SYMBOL = /* @__PURE__ */ Symbol.for("kendex.pi.caveman");
var PI_AGENTS_STATUSLINE_SYMBOL = /* @__PURE__ */ Symbol.for("kendex.pi-agents-tmux.statusline");
var CLAUDE_BILLING_IDENTITY_SYMBOL = /* @__PURE__ */ Symbol.for("kendex.pi.claude-bridge.billing-identity.v1");
var CAVEMAN_ICON_ACTIVE = "\uEE9A";
var CAVEMAN_ICON_INACTIVE = "\u{F19E0}";
var THINKING_TIMER_STORE_SYMBOL = /* @__PURE__ */ Symbol.for("kendex.pi-qol.thinking-timer.store");
var THINKING_TIMER_PATCH_SYMBOL = /* @__PURE__ */ Symbol.for("kendex.pi-qol.thinking-timer.patch");
var SESSION_SEARCH_PENDING_SYMBOL = /* @__PURE__ */ Symbol.for("kendex.pi-qol.session-search.pending-context");
var PENDING_QUEUE_THEME_PATCH_SYMBOL = /* @__PURE__ */ Symbol.for("kendex.pi-qol.pending-queue.theme-patch");
var STATUS_TEXT_ALIGNMENT_PATCH_SYMBOL = /* @__PURE__ */ Symbol.for("kendex.pi-qol.status-text-alignment-patch");
var QUESTION_OPENED_EVENT = "kendex:pi-questions:opened";
var QUESTION_NOTIFY_DEDUP_MS = 2e3;
var DEFAULT_NOTIFICATION_TITLE = "Pi";
var DEFAULT_NOTIFICATION_COOLDOWN_SECONDS = 8;
var DEFAULT_NOTIFICATION_BODY_MAX_CHARS = 240;
var DEFAULT_TMUX_MESSAGE_DURATION_MS = 5e3;
var TMUX_COMMAND_TIMEOUT_MS = 1e3;
var DEFAULT_COMPACTION_MODEL = "current";
var DEFAULT_COMPACTION_MAX_TOKENS = 8192;
var DEFAULT_IDLE_COMPACTION_THRESHOLD_TOKENS = 2e5;
var DEFAULT_IDLE_COMPACTION_SECONDS = 300;
var DEFAULT_BUDGET_GUARD_PERCENT = 85;
var DEFAULT_BUDGET_GUARD_TOKENS = -1;
var DEFAULT_BUDGET_MAX_INPUT_CHARS = 24e4;
var DEFAULT_TRANSCRIPT_RISK_WARN_CHARS = 6e5;
var QOL_BUDGET_HANDOFF_FOLDER = "pi-qol/handoff";
var QOL_BUDGET_HANDOFF_LATEST = "latest.json";
var DEFAULT_PERMISSION_GATE_COMMANDS = "rm -Rf";
var DEFAULT_PERMISSION_GATE_PREVIEW_LINES = 12;
var DEFAULT_PERMISSION_GATE_PREVIEW_CHARS = 1200;
var DEFAULT_PERMISSION_GATE_PREVIEW_LINE_WIDTH = 120;
var DEFAULT_SESSION_SEARCH_LIMIT = 40;
var DEFAULT_SESSION_SEARCH_SHORTCUT = "f2";
var DEFAULT_SESSION_SEARCH_SUMMARY_INPUT_CHARS = 18e4;
var DEFAULT_SESSION_SEARCH_SUMMARY_MAX_TOKENS = 4096;
var DEFAULT_SESSION_SEARCH_CACHE_TTL_SECONDS = 300;
var SESSION_SEARCH_TEXT_MAX_CHARS_PER_SESSION = 32768;
var SESSION_SEARCH_TEXT_MAX_CHARS = 8388608;
var SESSION_SEARCH_USER_MESSAGES_MAX_SESSIONS = 64;
var THINKING_TIMER_MAX_DURATIONS = 256;
var SESSION_SEARCH_OVERLAY_HEIGHT_RATIO = 0.9;
var DEFAULT_AUTO_RENAME_MODEL = "openai-codex/gpt-5.4-mini";
var DEFAULT_AUTO_RENAME_FALLBACK_MODEL = "current";
var DEFAULT_AUTO_RENAME_INPUT_CHARS = 2e3;
var DEFAULT_AUTO_RENAME_NAME_CHARS = 80;
var DEFAULT_AUTO_RENAME_MAX_TOKENS = 128;
var DEFAULT_AUTO_RENAME_TIMEOUT_MS = 12e3;
var DEFAULT_INPUT_BOTTOM_PADDING_LINES = 0;
var SESSION_TITLE_SYNC_INTERVAL_MS = 1e3;
var TMUX_SESSION_TITLE_PAD = "\xA0";
var TMUX_SESSION_TITLE_BORDER_FORMAT = `${TMUX_SESSION_TITLE_PAD}#{pane_title}${TMUX_SESSION_TITLE_PAD}`;
var THINKING_LABEL_DEFAULT = "\uE28C ";
var QOL_COMPACTION_SYSTEM_PROMPT = "You summarize coding-agent sessions for continuation. Preserve exact technical facts, filenames, commands, constraints, decisions, blockers, and next actions. Do not invent details.";
var AUTO_RENAME_SYSTEM_PROMPT = "You create short, descriptive session names for coding-agent chats. Use 2-6 words in Title Case. Respond with only the name, no quotes, explanations, markdown, emoji, or trailing punctuation.";
var DEFAULT_AUTO_RENAME_PROMPT = `Generate a short, descriptive title for this Pi coding-agent session based on the first user message.

Rules:
- Use 2-6 words
- Use Title Case
- Be specific about the user's task or topic
- Do not mention Pi unless Pi itself is the task
- Return only the title

First user message:
{{message}}`;
var HANDOFF_SYSTEM_PROMPT = `You are a context transfer assistant. Given a conversation history and the user's goal for a new thread, generate a focused prompt that:

1. Summarizes relevant context from the conversation (decisions made, approaches taken, key findings)
2. Lists any relevant files that were discussed or modified
3. Clearly states the next task based on the user's goal
4. Is self-contained - the new thread should be able to proceed without the old conversation

Format your response as a prompt the user can send to start the new thread. Be concise but include all necessary context. Do not include any preamble like "Here's the prompt" - just output the prompt itself.

Example output format:
## Context
We've been working on X. Key decisions:
- Decision 1
- Decision 2

Files involved:
- path/to/file1.ts
- path/to/file2.ts

## Task
[Clear description of what to do next based on user's goal]`;

// src/extensions/qol/bridges.ts
function readCavemanBridge() {
  const host = globalThis;
  const value = host[CAVEMAN_BRIDGE_SYMBOL];
  return value && typeof value === "object" ? value : void 0;
}
function readClaudeBillingIdentityBridge() {
  const host = globalThis;
  const value = host[CLAUDE_BILLING_IDENTITY_SYMBOL];
  return value?.version === 1 && typeof value.currentLoginEmail === "function" ? value : void 0;
}
function readPiAgentsStatuslineBridge() {
  const host = globalThis;
  const value = host[PI_AGENTS_STATUSLINE_SYMBOL];
  return value && typeof value === "object" && typeof value.getCurrentSubagent === "function" ? value : void 0;
}
function getQuestionService() {
  const service = globalThis[QUESTION_SERVICE_SYMBOL];
  if (!service || typeof service !== "object") return void 0;
  const candidate = service;
  if (typeof candidate.subscribe === "function" && typeof candidate.listPending === "function") return candidate;
  return void 0;
}
function acquirekendexModalLock() {
  const host = globalThis;
  const existing = host[KENDEX_MODAL_LOCK_SYMBOL];
  const lock = existing && typeof existing.depth === "number" ? existing : { depth: 0 };
  host[KENDEX_MODAL_LOCK_SYMBOL] = lock;
  lock.depth += 1;
  let released = false;
  return () => {
    if (released) return;
    released = true;
    lock.depth = Math.max(0, lock.depth - 1);
  };
}

// src/extensions/qol/budget-guard.ts
function computeBudgetTrigger(input) {
  if (!input.enabled) return void 0;
  if (!Number.isFinite(input.tokens) || input.tokens <= 0) return void 0;
  const tokenLimit = Math.floor(input.tokenLimit);
  if (tokenLimit > 0 && input.tokens >= tokenLimit) {
    const bucket = Math.floor(input.tokens / Math.max(1, tokenLimit));
    return {
      contextWindow: input.contextWindow,
      key: `tokens:${tokenLimit}:${bucket}`,
      percent: input.contextWindow ? input.tokens / input.contextWindow * 100 : void 0,
      reason: `${input.tokens.toLocaleString()} tokens >= ${tokenLimit.toLocaleString()} budget token limit`,
      tokens: input.tokens
    };
  }
  const percentLimit = input.percentLimit;
  if (percentLimit > 0 && input.contextWindow) {
    const percent = input.tokens / input.contextWindow * 100;
    if (percent >= percentLimit) {
      const bucket = Math.floor(percent / Math.max(1, percentLimit));
      return {
        contextWindow: input.contextWindow,
        key: `percent:${percentLimit}:${bucket}`,
        percent,
        reason: `${percent.toFixed(1)}% context >= ${percentLimit}% budget guard`,
        tokens: input.tokens
      };
    }
  }
  return void 0;
}
function chunkConversationText(text, maxChars) {
  if (maxChars <= 0 || text.length <= maxChars) return [text];
  const chunks = [];
  const breaks = /\n{2,}/g;
  let cursor = 0;
  while (cursor < text.length) {
    const remaining = text.length - cursor;
    if (remaining <= maxChars) {
      chunks.push(text.slice(cursor));
      break;
    }
    const slice = text.slice(cursor, cursor + maxChars);
    breaks.lastIndex = 0;
    let breakAt = -1;
    let match;
    while ((match = breaks.exec(slice)) !== null) {
      if (match.index >= Math.floor(maxChars / 2)) breakAt = match.index + match[0].length;
    }
    const end = breakAt > 0 ? cursor + breakAt : cursor + maxChars;
    chunks.push(text.slice(cursor, end));
    cursor = end;
  }
  return chunks;
}
function evaluateTranscriptRisk(input) {
  if (input.error) {
    return { chars: 0, error: input.error, exceeded: false, messageCount: input.messageCount, threshold: input.threshold };
  }
  if (input.threshold <= 0 || input.messageCount <= 0 || input.chars <= 0) {
    return { chars: input.chars, exceeded: false, messageCount: input.messageCount, threshold: input.threshold };
  }
  return {
    chars: input.chars,
    exceeded: input.chars >= input.threshold,
    messageCount: input.messageCount,
    threshold: input.threshold
  };
}
var QOL_BUDGET_GUARD_SENTINEL = "[QOL_BUDGET_GUARD]";
function isBudgetGuardCompaction(customInstructions) {
  return typeof customInstructions === "string" && customInstructions.includes(QOL_BUDGET_GUARD_SENTINEL);
}
function instructionsForChunk(custom, index, total) {
  const base = `This is chunk ${index + 1} of ${total} from a long conversation. Preserve all concrete files, commands, decisions, blockers, and current tasks visible in this chunk so a follow-up summary-of-summaries pass can stitch the timeline together.`;
  return custom?.trim() ? `${custom.trim()}

${base}` : base;
}
function instructionsForReduce(custom, level, count) {
  const base = `Tree-reduce level ${level}: merge the following ${count} chunk summaries (oldest first) into a single continuation summary. De-duplicate facts, keep exact files/commands/paths, preserve decisions, blockers, current tasks, and any artifact paths. If chunks contradict, prefer the most recent.`;
  return custom?.trim() ? `${custom.trim()}

${base}` : base;
}
function partition(items, maxChars, separator, minBatch = 1) {
  const groups = [];
  let current = [];
  let currentLen = 0;
  const sepLen = separator.length;
  for (const item of items) {
    const projected = current.length === 0 ? item.length : currentLen + sepLen + item.length;
    if (current.length >= minBatch && projected > maxChars) {
      groups.push(current);
      current = [item];
      currentLen = item.length;
    } else {
      current.push(item);
      currentLen = projected;
    }
  }
  if (current.length > 0) groups.push(current);
  return groups;
}
async function orchestrateChunkedSummary(options) {
  const { customInstructions, maxInputChars, notify, previousSummary, signal, summarize, text } = options;
  if (maxInputChars <= 0 || text.length <= maxInputChars) {
    if (signal?.aborted) throw new Error("Compaction aborted");
    const single = await summarize({
      customInstructions,
      previousSummary,
      skipChunking: true,
      text
    });
    return { ...single, chunkCount: 1, reduceLevels: 0, requestCount: 1 };
  }
  const chunks = chunkConversationText(text, maxInputChars);
  notify?.(`QOL chunked compaction: summarizing ${chunks.length} chunk(s) (input ${text.length.toLocaleString()} chars > ${maxInputChars.toLocaleString()} cap).`, "info");
  let requestCount = 0;
  const partials = [];
  let lastVia = "model";
  let lastModel = "";
  let previous = previousSummary;
  for (let i = 0; i < chunks.length; i += 1) {
    if (signal?.aborted) throw new Error("Compaction aborted");
    const chunk = chunks[i] ?? "";
    const partial = await summarize({
      customInstructions: instructionsForChunk(customInstructions, i, chunks.length),
      previousSummary: previous,
      skipChunking: true,
      text: chunk
    });
    requestCount += 1;
    if (!partial.summary.trim()) throw new Error(`Chunk ${i + 1}/${chunks.length} summary was empty`);
    partials.push(`### Chunk ${i + 1}/${chunks.length}
${partial.summary.trim()}`);
    previous = partial.summary;
    lastVia = partial.via;
    lastModel = partial.model;
  }
  let level = partials;
  let reduceLevels = 0;
  const separator = "\n\n";
  const MAX_REDUCE_LEVELS = 12;
  while (true) {
    const combined = level.join(separator);
    if (combined.length <= maxInputChars) {
      if (signal?.aborted) throw new Error("Compaction aborted");
      const final = await summarize({
        customInstructions: instructionsForReduce(customInstructions, reduceLevels + 1, level.length),
        previousSummary,
        skipChunking: true,
        text: combined
      });
      requestCount += 1;
      if (!final.summary.trim()) throw new Error("Final reduce summary was empty");
      return {
        chunkCount: chunks.length,
        model: final.model || lastModel,
        reduceLevels: reduceLevels + 1,
        requestCount,
        summary: final.summary,
        via: final.via || lastVia
      };
    }
    reduceLevels += 1;
    if (reduceLevels > MAX_REDUCE_LEVELS) {
      const truncated = combined.slice(0, maxInputChars);
      const final = await summarize({
        customInstructions: instructionsForReduce(customInstructions, reduceLevels, level.length),
        previousSummary,
        skipChunking: true,
        text: truncated
      });
      requestCount += 1;
      return {
        chunkCount: chunks.length,
        model: final.model || lastModel,
        reduceLevels,
        requestCount,
        summary: final.summary,
        via: final.via || lastVia
      };
    }
    const minBatch = 2;
    const batches = partition(level, maxInputChars, separator, minBatch);
    const nextLevel = [];
    for (const batch of batches) {
      if (signal?.aborted) throw new Error("Compaction aborted");
      if (batch.length === 1) {
        const only = batch[0] ?? "";
        nextLevel.push(only.length > maxInputChars ? only.slice(0, maxInputChars) : only);
        continue;
      }
      let batchText = batch.join(separator);
      if (batchText.length > maxInputChars) batchText = batchText.slice(0, maxInputChars);
      const summary = await summarize({
        customInstructions: instructionsForReduce(customInstructions, reduceLevels, batch.length),
        previousSummary,
        skipChunking: true,
        text: batchText
      });
      requestCount += 1;
      if (!summary.summary.trim()) throw new Error(`Tree-reduce level ${reduceLevels} batch summary was empty`);
      nextLevel.push(summary.summary);
      lastVia = summary.via;
      lastModel = summary.model;
    }
    if (nextLevel.length === 0) throw new Error("Tree-reduce collapsed to empty level");
    if (nextLevel.length >= level.length) {
    }
    level = nextLevel;
    if (level.length === 1 && level[0].length <= maxInputChars) {
      return {
        chunkCount: chunks.length,
        model: lastModel,
        reduceLevels,
        requestCount,
        summary: level[0],
        via: lastVia
      };
    }
  }
}

// src/extensions/qol/budget-guard-runtime.ts
var BudgetGuardDriver = class {
  generation = 0;
  satisfiedTrigger;
  pendingTrigger;
  inFlight;
  sessionCompactVersion = 0;
  reset() {
    this.inFlight?.resolveCompletion();
    this.generation += 1;
    this.satisfiedTrigger = void 0;
    this.pendingTrigger = void 0;
    this.inFlight = void 0;
    this.sessionCompactVersion = 0;
    return this.generation;
  }
  /** Returns true when no compaction call is currently active. Visible for tests. */
  get canFire() {
    return this.inFlight === void 0;
  }
  get currentKey() {
    return this.inFlight?.key ?? this.pendingTrigger?.trigger.key ?? this.satisfiedTrigger?.key;
  }
  /**
   * Observe the trigger at agent_end without calling ctx.compact. Pi performs
   * its built-in post-agent compaction check before agent_settled, so staging
   * here prevents two compaction attempts from racing each other.
   */
  stage(trigger, staleCtx, generation = this.generation) {
    if (generation !== this.generation) return { kind: "ignored" };
    if (staleCtx?.()) return { kind: "ignored" };
    if (this.inFlight) return { kind: "in-flight" };
    if (!trigger) {
      this.pendingTrigger = void 0;
      this.satisfiedTrigger = void 0;
      return { kind: "no-trigger" };
    }
    if (this.satisfiedTrigger?.generation === generation && trigger.key === this.satisfiedTrigger.key || this.pendingTrigger?.generation === generation && trigger.key === this.pendingTrigger.trigger.key) {
      return { kind: "dedup" };
    }
    this.pendingTrigger = { generation, trigger };
    return { kind: "staged", reason: trigger.reason };
  }
  /**
   * A completed Pi compaction satisfies whichever budget trigger is pending or
   * in flight. Keep that key suppressed until usage produces no trigger or a
   * genuinely different trigger key.
   */
  noteSessionCompacted(generation = this.generation) {
    if (generation !== this.generation) return false;
    this.sessionCompactVersion += 1;
    const currentKey = this.inFlight?.key ?? this.pendingTrigger?.trigger.key;
    if (currentKey) this.satisfiedTrigger = { generation, key: currentKey };
    this.pendingTrigger = void 0;
    return true;
  }
  /** Dispatch a trigger staged by agent_end. */
  dispatchPending(input) {
    const completed = (outcome) => ({ completion: Promise.resolve(), outcome });
    const generation = input.generation ?? this.generation;
    if (generation !== this.generation) return completed({ kind: "ignored" });
    if (input.staleCtx?.()) return completed({ kind: "ignored" });
    if (this.inFlight) return completed({ kind: "in-flight" });
    const pending = this.pendingTrigger;
    if (!pending || pending.generation !== generation) return completed({ kind: "no-trigger" });
    const trigger = pending.trigger;
    if (this.satisfiedTrigger?.generation === generation && trigger.key === this.satisfiedTrigger.key) {
      this.pendingTrigger = void 0;
      return completed({ kind: "dedup" });
    }
    if (typeof input.compact !== "function") {
      input.notify(`QOL budget guard cannot fire: ctx.compact is unavailable (${trigger.reason}).`, "warning");
      return completed({ kind: "no-compact-fn" });
    }
    input.notify(`QOL budget guard starting compaction: ${trigger.reason}`, "info");
    input.onStatus?.(`QOL budget guard compacting session: ${trigger.reason}`);
    let resolveCompletion = () => {
    };
    const completion = new Promise((resolve4) => {
      resolveCompletion = resolve4;
    });
    const dispatch = {
      generation,
      key: trigger.key,
      resolveCompletion,
      sessionCompactVersion: this.sessionCompactVersion
    };
    this.pendingTrigger = void 0;
    this.inFlight = dispatch;
    this.satisfiedTrigger = { generation, key: trigger.key };
    const instructions = `${QOL_BUDGET_GUARD_SENTINEL} QOL budget guard triggered at agent_end because ${trigger.reason}. Bound the summary input, preserve current task state, decisions, files, blockers, and next steps.`;
    try {
      input.compact({
        customInstructions: instructions,
        onComplete: () => {
          if (this.generation !== dispatch.generation || this.inFlight !== dispatch) return;
          try {
            this.inFlight = void 0;
            this.satisfiedTrigger = { generation: dispatch.generation, key: dispatch.key };
            input.onStatus?.(void 0);
            input.notify("QOL budget guard compaction completed.", "info");
          } finally {
            dispatch.resolveCompletion();
          }
        },
        onError: (error) => {
          if (this.generation !== dispatch.generation || this.inFlight !== dispatch) return;
          const duplicateCompletedAfterDispatch = error.message === "Already compacted" && this.sessionCompactVersion > dispatch.sessionCompactVersion;
          if (duplicateCompletedAfterDispatch) {
            try {
              this.inFlight = void 0;
              this.satisfiedTrigger = { generation: dispatch.generation, key: dispatch.key };
              input.onStatus?.(void 0);
            } finally {
              dispatch.resolveCompletion();
            }
            return;
          }
          try {
            this.inFlight = void 0;
            if (this.sessionCompactVersion === dispatch.sessionCompactVersion) {
              this.satisfiedTrigger = void 0;
            }
            input.onStatus?.(void 0);
            input.notify(`QOL budget guard compaction failed: ${error.message}`, "error");
          } finally {
            dispatch.resolveCompletion();
          }
        }
      });
      return { completion, outcome: { kind: "dispatched", reason: trigger.reason } };
    } catch (error) {
      if (this.generation === dispatch.generation && this.inFlight === dispatch) {
        try {
          this.inFlight = void 0;
          this.satisfiedTrigger = void 0;
          input.onStatus?.(void 0);
          const message3 = error instanceof Error ? error.message : String(error);
          input.notify(`QOL budget guard compaction failed to start: ${message3}`, "error");
          return { completion, outcome: { kind: "dispatch-threw", error: message3, reason: trigger.reason } };
        } finally {
          dispatch.resolveCompletion();
        }
      }
      dispatch.resolveCompletion();
      const message2 = error instanceof Error ? error.message : String(error);
      return { completion, outcome: { kind: "dispatch-threw", error: message2, reason: trigger.reason } };
    }
  }
};

// src/extensions/qol/ansi.ts
var ANSI_PATTERN = /\x1B(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~]|\][^\x07]*(?:\x07|\x1B\\))/g;
var ANSI_ESCAPE_RE = /\x1b\[[0-?]*[ -/]*[@-~]/g;
var ANSI_GREEN_FG = "\x1B[32m";
var ANSI_RED_FG = "\x1B[31m";
var ANSI_YELLOW_FG = "\x1B[33m";
var ANSI_FG_RESET = "\x1B[39m";
function stripAnsi(text) {
  return text.replace(ANSI_PATTERN, "");
}
function ansiGreen(text) {
  return `${ANSI_GREEN_FG}${text}${ANSI_FG_RESET}`;
}
function ansiRed(text) {
  return `${ANSI_RED_FG}${text}${ANSI_FG_RESET}`;
}
function ansiYellow(text) {
  return `${ANSI_YELLOW_FG}${text}${ANSI_FG_RESET}`;
}
function oneLine(text) {
  return text.replace(ANSI_ESCAPE_RE, "").replace(/[\r\n\t]+/g, " ").replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g, " ").replace(/\s+/g, " ").trim();
}
function ansiSequenceEnd(input, start) {
  const introducer = input[start + 1];
  if (introducer == null) return start + 1;
  if (introducer === "]" || introducer === "P" || introducer === "_" || introducer === "^" || introducer === "X") {
    const st = input.indexOf("\x1B\\", start + 2);
    const bell = introducer === "]" ? input.indexOf("\x07", start + 2) : -1;
    if (bell >= 0 && (st < 0 || bell < st)) return bell + 1;
    return st >= 0 ? st + 2 : input.length;
  }
  if (introducer === "[") {
    let index = start + 2;
    while (index < input.length) {
      const code = input.charCodeAt(index);
      if (code >= 64 && code <= 126) return index + 1;
      index += 1;
    }
    return input.length;
  }
  return Math.min(start + 2, input.length);
}
function buildVisibleMap(input) {
  const rawIndexByVisibleIndex = [0];
  let text = "";
  let index = 0;
  while (index < input.length) {
    if (input.charCodeAt(index) === 27) {
      index = ansiSequenceEnd(input, index);
      continue;
    }
    if (rawIndexByVisibleIndex[text.length] === void 0) rawIndexByVisibleIndex[text.length] = index;
    text += input[index] ?? "";
    index += 1;
    rawIndexByVisibleIndex[text.length] = index;
  }
  if (rawIndexByVisibleIndex[text.length] === void 0) rawIndexByVisibleIndex[text.length] = index;
  return { rawIndexByVisibleIndex, text };
}
function applyVisibleReplacements(input, map, replacements) {
  if (replacements.length === 0) return input;
  const sorted = replacements.filter((replacement) => replacement.end > replacement.start).sort((a, b) => a.start - b.start || b.end - a.end);
  let output = "";
  let lastRawIndex = 0;
  let lastVisibleIndex = 0;
  for (const replacement of sorted) {
    if (replacement.start < lastVisibleIndex) continue;
    const rawStart = map.rawIndexByVisibleIndex[replacement.start];
    const rawEnd = map.rawIndexByVisibleIndex[replacement.end];
    if (rawStart == null || rawEnd == null || rawStart < lastRawIndex) continue;
    output += input.slice(lastRawIndex, rawStart) + replacement.text;
    lastRawIndex = rawEnd;
    lastVisibleIndex = replacement.end;
  }
  return output + input.slice(lastRawIndex);
}

// src/extensions/qol/pi-ai-compat.ts
import * as piAi from "@earendil-works/pi-ai";
var dynamicImport = (specifier) => import(specifier);
async function complete(model, context, options, deps = {}) {
  const rootComplete = (deps.root ?? piAi).complete;
  if (typeof rootComplete === "function") return await rootComplete(model, context, options);
  const compat = deps.loadCompat ? await deps.loadCompat() : await dynamicImport("@earendil-works/pi-ai/compat");
  return await compat.complete(model, context, options);
}
async function retryAssistantCallCompat(produce, signal, callbacks, deps = {}) {
  const candidate = (deps.root ?? piAi).retryAssistantCall;
  if (typeof candidate !== "function") return produce();
  return candidate(produce, { enabled: true, maxRetries: 3, baseDelayMs: 2e3 }, signal, callbacks);
}

// src/extensions/qol/compaction.ts
import { convertToLlm, serializeConversation } from "@earendil-works/pi-coding-agent";

// src/extensions/qol/compaction-handoff.ts
import { writeFileSync as writeFileSync2 } from "node:fs";
import { basename, dirname as dirname2, join as join3 } from "node:path";

// src/extensions/qol/package-config.ts
import { existsSync, readFileSync as readFileSync2 } from "node:fs";
import { homedir } from "node:os";
import { dirname, join as join2, resolve } from "node:path";
var SETTINGS_CHANGED_EVENT = "kendex:extension-settings-changed";
var SETTINGS_RECHECK_MS = 1e3;
function expandHome(input) {
  if (input === "~") return homedir();
  if (input.startsWith("~/")) return join2(homedir(), input.slice(2));
  return input;
}
function rootAnchored(path, windows) {
  return windows ? /^(?:[A-Za-z]:[\\/]|[\\/]{2}[^\\/]+[\\/][^\\/]+)/.test(path) : path.startsWith("/");
}
var userDirMemo;
function userDir() {
  const agentDir = process.env.PI_CODING_AGENT_DIR;
  const home = process.env.HOME;
  const profile = process.env.USERPROFILE;
  const known = userDirMemo;
  if (known !== void 0 && known.agentDir === agentDir && known.home === home && known.profile === profile) return known;
  const override = expandHome(agentDir?.trim() || "");
  const dir = resolve(rootAnchored(override, process.platform === "win32") ? override : expandHome("~/.pi/agent"));
  userDirMemo = { agentDir, home, profile, dir, settings: join2(dir, "settings.json") };
  return userDirMemo;
}
function piUserDir() {
  return userDir().dir;
}
var memo = /* @__PURE__ */ new Map();
function clearPackageConfigCache() {
  memo.clear();
  cwdSettings.clear();
  userSettingsMemo = void 0;
}
function openEntry(store, key, now) {
  const entry = store.get(key);
  return entry !== void 0 && now - entry.readAt < SETTINGS_RECHECK_MS ? entry : void 0;
}
function memoIn(store, key, now, compute, fingerprint, reusable) {
  const open3 = openEntry(store, key, now);
  if (open3 !== void 0) return open3.value;
  const entry = store.get(key);
  const print = fingerprint?.();
  if (entry !== void 0 && print !== void 0 && entry.fingerprint === print) {
    entry.readAt = now;
    return entry.value;
  }
  const value = compute();
  store.set(key, { readAt: now, fingerprint: reusable === void 0 || reusable(value) ? print : void 0, value });
  return value;
}
function projectSettingsPath(cwd) {
  let current = resolve(cwd);
  while (true) {
    const candidate = join2(current, ".pi", "settings.json");
    if (existsSync(candidate)) return candidate;
    if (existsSync(join2(current, ".pi")) || existsSync(join2(current, ".git")) || existsSync(join2(current, ".kendex-lock.json"))) return candidate;
    const parent = dirname(current);
    if (parent === current) return join2(resolve(cwd), ".pi", "settings.json");
    current = parent;
  }
}
var PROJECT_TRUST_SYMBOL = /* @__PURE__ */ Symbol.for("kendex.pi.project-trust");
var trustRegistry;
function projectTrustRegistry() {
  if (trustRegistry !== void 0) return trustRegistry;
  const host = globalThis;
  trustRegistry = host[PROJECT_TRUST_SYMBOL] ?? {};
  host[PROJECT_TRUST_SYMBOL] = trustRegistry;
  return trustRegistry;
}
function projectTrusted(ctx) {
  try {
    return ctx.isProjectTrusted?.() === true;
  } catch {
    return false;
  }
}
function recordSettingsTrust(settingsPath, ctx) {
  const registry = projectTrustRegistry();
  if (!registry.projectSettings) registry.projectSettings = /* @__PURE__ */ new Map();
  registry.projectSettings.set(settingsPath, projectTrusted(ctx));
}
function recordProjectTrust(ctx) {
  if (!ctx.cwd) return;
  recordSettingsTrust(projectSettingsPath(ctx.cwd), ctx);
}
function settingsFileTrusted(settingsPath) {
  return projectTrustRegistry().projectSettings?.get(settingsPath) === true;
}
var userSettingsMemo;
function userSettingsPathAt(now) {
  const known = userSettingsMemo;
  if (known !== void 0 && now - known.readAt < SETTINGS_RECHECK_MS) return known.path;
  const path = userDir().settings;
  userSettingsMemo = { readAt: now, path };
  return path;
}
var pathListsUser;
var pathLists = /* @__PURE__ */ new Map();
function userAndProjectSettingsPathsAt(project, now) {
  const user = userSettingsPathAt(now);
  if (user !== pathListsUser) {
    pathLists.clear();
    pathListsUser = user;
  }
  let paths = pathLists.get(project);
  if (paths === void 0) {
    paths = Object.freeze(project === void 0 ? [user] : [user, project]);
    pathLists.set(project, paths);
  }
  return paths;
}
function piSettingsPaths(cwd = process.cwd()) {
  return cwdSettingsAt(cwd, performance.now()).paths;
}
function isRecord(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
function deepFreeze(value) {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}
function readText(path) {
  try {
    return { kind: "text", text: readFileSync2(path, "utf8") };
  } catch (error) {
    const code = error?.code;
    if (code === "ENOENT" || code === "ENOTDIR") return { kind: "absent" };
    return { kind: "unreadable", error: error instanceof Error ? error.message : String(error) };
  }
}
var settingsFilesKeys = /* @__PURE__ */ new WeakMap();
function settingsFilesKey(paths) {
  let key = settingsFilesKeys.get(paths);
  if (key === void 0) {
    key = `settings-files\0${paths.join("\0")}`;
    settingsFilesKeys.set(paths, key);
  }
  return key;
}
function readSettingsFiles(paths) {
  return readSettingsFilesAt(paths, performance.now());
}
function readSettingsFilesAt(paths, now) {
  const key = settingsFilesKey(paths);
  const open3 = openEntry(memo, key, now);
  if (open3 !== void 0) return open3.value;
  let texts = [];
  return memoIn(
    memo,
    key,
    now,
    () => deepFreeze(
      paths.flatMap((path, index) => {
        const text = texts[index] ?? readText(path);
        if (text.kind === "absent") return [];
        if (text.kind === "unreadable") return [{ kind: "malformed", path, error: text.error }];
        try {
          const parsed = JSON.parse(text.text);
          return [{ kind: "parsed", path, settings: isRecord(parsed) ? parsed : {} }];
        } catch (error) {
          return [{ kind: "malformed", path, error: error instanceof Error ? error.message : String(error) }];
        }
      })
    ),
    () => {
      texts = paths.map(readText);
      return JSON.stringify(texts);
    }
  );
}
function packageConfigIn(settings, packageId) {
  const kendex = settings.kendex;
  const manager = isRecord(kendex) ? kendex.extensionManager : void 0;
  const config = isRecord(manager) ? manager.config : void 0;
  const own = isRecord(config) ? config[packageId] : void 0;
  return isRecord(own) ? own : void 0;
}
var cwdSettings = /* @__PURE__ */ new Map();
function cwdSettingsAt(cwd, now) {
  const known = cwdSettings.get(cwd);
  const open3 = known !== void 0 && now - known.readAt < SETTINGS_RECHECK_MS ? known : void 0;
  if (open3 !== void 0 && settingsFileTrusted(open3.project) === open3.trusted) return open3;
  const project = open3 !== void 0 ? open3.project : projectSettingsPath(cwd);
  const trusted = settingsFileTrusted(project);
  const paths = userAndProjectSettingsPathsAt(trusted ? project : void 0, now);
  const files = readSettingsFilesAt(paths, now);
  const filesReadAt = memo.get(settingsFilesKey(paths))?.readAt ?? now;
  const readAt = Math.min(open3 !== void 0 ? open3.readAt : now, filesReadAt);
  const view = { readAt, project, trusted, paths, files, configs: configsOver(files) };
  cwdSettings.set(cwd, view);
  return view;
}
var configsByFiles = /* @__PURE__ */ new WeakMap();
function configsOver(files) {
  let configs = configsByFiles.get(files);
  if (!configs) {
    configs = /* @__PURE__ */ new Map();
    configsByFiles.set(files, configs);
  }
  return configs;
}
function packageConfigOver(packageId, files, configs) {
  const known = configs.get(packageId);
  if (known) return known;
  const merged = {};
  for (const file of files) {
    if (file.kind !== "parsed") continue;
    const config = packageConfigIn(file.settings, packageId);
    if (config) Object.assign(merged, config);
  }
  const frozen = Object.freeze(merged);
  configs.set(packageId, frozen);
  return frozen;
}
function readPackageConfig(packageId, cwd = process.cwd()) {
  const view = cwdSettingsAt(cwd, performance.now());
  return packageConfigOver(packageId, view.files, view.configs);
}
function installSettingsCacheRefresh(pi) {
  let unsubscribe;
  pi.on("session_start", () => {
    clearPackageConfigCache();
    unsubscribe ??= pi.events.on(SETTINGS_CHANGED_EVENT, () => clearPackageConfigCache());
  });
  pi.on("session_shutdown", () => {
    unsubscribe?.();
    unsubscribe = void 0;
    clearPackageConfigCache();
  });
}

// src/extensions/qol/compaction-handoff.ts
function safeFileName(value) {
  return value.replace(/[^\w.-]+/g, "_");
}
function sessionIdFromManager(sm, fallbackPid = process.pid) {
  try {
    const id = typeof sm.getSessionId === "function" ? sm.getSessionId() : void 0;
    if (typeof id === "string" && id.trim()) return id;
  } catch {
  }
  try {
    const file = typeof sm.getSessionFile === "function" ? sm.getSessionFile() : void 0;
    if (typeof file === "string" && file.trim()) return basename(file, ".jsonl");
  } catch {
  }
  return `ephemeral-${fallbackPid}`;
}
function findLatestTaskState(branch) {
  for (let i = branch.length - 1; i >= 0; i -= 1) {
    const entry = branch[i];
    if (entry?.type !== "message" || entry.message?.role !== "toolResult") continue;
    const content = entry.message.content;
    const parts = Array.isArray(content) ? content : [];
    for (const part of parts) {
      if (part?.type !== "toolResult") continue;
      const details = part?.details;
      if (details && typeof details === "object" && "state" in details) {
        return details.state;
      }
    }
  }
  return void 0;
}
var ARTIFACT_REF_PATTERN = /(?:^|\s|["'`(\[<])((?:\.{1,2}\/|\/|~\/)?[\w.\-+@/]+\.(?:md|json|jsonl|txt|log|ts|tsx|js|jsx|rs|toml|yml|yaml|html|sh|fish|bash|py|go|java|cs|cpp|h|hpp|sql|csv|env|lock|patch|diff))/g;
function collectArtifactRefs(branch, maxRefs = 20) {
  const refs = /* @__PURE__ */ new Set();
  for (let i = branch.length - 1; i >= 0 && refs.size < maxRefs; i -= 1) {
    const entry = branch[i];
    if (entry?.type !== "message") continue;
    const content = entry.message?.content;
    const parts = Array.isArray(content) ? content : [];
    for (const part of parts) {
      const text = typeof part?.text === "string" ? part.text : typeof part?.thinking === "string" ? part.thinking : "";
      if (!text) continue;
      ARTIFACT_REF_PATTERN.lastIndex = 0;
      let match;
      while ((match = ARTIFACT_REF_PATTERN.exec(text)) !== null && refs.size < maxRefs) {
        if (match[1]) refs.add(match[1]);
      }
    }
  }
  return Array.from(refs);
}
function buildBudgetHandoff(input) {
  const preparation = input.preparation ?? {};
  const messageCount = (preparation.messagesToSummarize?.length ?? 0) + (preparation.turnPrefixMessages?.length ?? 0);
  let branch = [];
  try {
    const raw = typeof input.sessionManager.getBranch === "function" ? input.sessionManager.getBranch() : [];
    branch = Array.isArray(raw) ? raw : [];
  } catch {
    branch = [];
  }
  return {
    artifactRefs: collectArtifactRefs(branch),
    messageCount,
    previousSummary: preparation.previousSummary,
    reason: input.reason,
    sessionId: sessionIdFromManager(input.sessionManager),
    taskState: findLatestTaskState(branch),
    timestamp: input.timestamp ?? Date.now(),
    tokensBefore: typeof preparation.tokensBefore === "number" ? preparation.tokensBefore : void 0
  };
}
function handoffStampedPath(baseDir, timestamp) {
  return join3(baseDir, `${new Date(timestamp).toISOString().replace(/[:.]/g, "-")}.json`);
}
function handoffBaseDir(sessionId, root = piUserDir()) {
  return join3(root, "kendex", "sessions", safeFileName(sessionId), QOL_BUDGET_HANDOFF_FOLDER);
}
function defaultWriter(path, payload) {
  writeFileSync2(path, payload, { mode: 384 });
}
function writeBudgetHandoffArtifact(handoff, options) {
  if (!options.enabled) return {};
  const baseDir = handoffBaseDir(handoff.sessionId, options.root);
  const stampedPath = handoffStampedPath(baseDir, handoff.timestamp);
  const latestPath = join3(dirname2(baseDir), basename(baseDir), QOL_BUDGET_HANDOFF_LATEST);
  const mkdir = options.mkdir ?? ((path) => openLaneDir(path, options.cwd));
  const writer = options.writer ?? defaultWriter;
  try {
    mkdir(baseDir);
    const payload = JSON.stringify(handoff, null, 2);
    writer(stampedPath, payload);
    writer(latestPath, payload);
    return { latestPath, path: stampedPath };
  } catch (error) {
    const message2 = error instanceof Error ? error.message : String(error);
    return { error: message2 };
  }
}

// src/extensions/qol/settings.ts
function piCompactionEnabled(cwd) {
  let enabled;
  for (const file of readSettingsFiles(piSettingsPaths(cwd))) {
    if (file.kind !== "parsed") continue;
    const compaction = file.settings.compaction;
    if (compaction && typeof compaction === "object" && !Array.isArray(compaction) && compaction.enabled !== void 0) enabled = compaction.enabled;
  }
  return Boolean(enabled ?? true);
}
function readkendexConfig(cwd) {
  return readPackageConfig(CONFIG_ID, cwd);
}
function settingBoolean(key, fallback, cwd) {
  const value = readkendexConfig(cwd)[key];
  return typeof value === "boolean" ? value : fallback;
}
function settingString(key, fallback, cwd) {
  const value = readkendexConfig(cwd)[key];
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : fallback;
}
function settingStringAllowEmpty(key, fallback, cwd) {
  const value = readkendexConfig(cwd)[key];
  return typeof value === "string" ? value.trim() : fallback;
}
function newlineFallbackKey(cwd) {
  const configured = settingString("newlineFallbackKey", "ctrl+j", cwd).toLowerCase();
  return configured === "none" ? "none" : "ctrl+j";
}
function settingNumber(key, fallback, cwd) {
  const value = readkendexConfig(cwd)[key];
  const parsed = typeof value === "number" ? value : typeof value === "string" ? Number(value) : Number.NaN;
  return Number.isFinite(parsed) ? parsed : fallback;
}
function boundedSettingNumber(key, fallback, min, max, cwd) {
  return Math.max(min, Math.min(max, Math.floor(settingNumber(key, fallback, cwd))));
}

// src/extensions/qol/util.ts
function stringifyError(error) {
  return error instanceof Error ? error.message : String(error);
}
function escapeRegex(input) {
  return input.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// src/extensions/qol/gateway-privacy.ts
function isRecord2(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
function gatewayPrivacyCovers(model, cwd) {
  const provider = model?.provider;
  return (provider === "openrouter" || provider === "vercel-ai-gateway") && settingBoolean("gatewayPrivacy.enabled", false, cwd);
}
function gatewayPrivacyBlocksNativeSummary(ctx) {
  recordProjectTrust(ctx);
  return gatewayPrivacyCovers(ctx.model, ctx.cwd);
}
function gatewayPrivacyOnPayload(ctx) {
  const cwd = ctx.cwd;
  recordProjectTrust(ctx);
  return (payload, model) => {
    if (!gatewayPrivacyCovers(model, cwd)) return void 0;
    const body = payload;
    if (!isRecord2(body)) return void 0;
    if (model?.provider === "openrouter") {
      return {
        ...body,
        provider: {
          ...isRecord2(body.provider) ? body.provider : {},
          zdr: true,
          data_collection: "deny"
        }
      };
    }
    const options = isRecord2(body.providerOptions) ? body.providerOptions : {};
    return {
      ...body,
      providerOptions: {
        ...options,
        gateway: {
          ...isRecord2(options.gateway) ? options.gateway : {},
          zeroDataRetention: true,
          disallowPromptTraining: true
        }
      }
    };
  };
}
function registerGatewayPrivacy(pi) {
  pi.on("before_provider_request", (event, ctx) => gatewayPrivacyOnPayload(ctx)(event.payload, ctx.model));
}

// src/extensions/qol/compaction.ts
function compactionNotify(ctx, message2, level = "info", required = false) {
  if (ctx.hasUI && (required || settingBoolean("compaction.notify", true, ctx.cwd))) ctx.ui.notify(message2, level);
  if (!ctx.hasUI && required) console.error(JSON.stringify({ source: "pi-qol", level, message: message2 }));
}
function compactionProfile(cwd) {
  const value = settingString("compaction.profile", "balanced", cwd);
  return value === "concise" || value === "exhaustive" ? value : "balanced";
}
function compactionProfileInstructions(profile) {
  if (profile === "concise") return "Prefer a compact continuation summary. Include only decisions, current state, modified/read files, blockers, and concrete next steps.";
  if (profile === "exhaustive") return "Be thorough. The summary may replace substantial conversation history, so preserve all relevant implementation details, alternatives considered, exact file paths, commands, errors, and pending work.";
  return "Be complete but not verbose. Preserve enough detail for a future assistant to continue without the old transcript.";
}
function stripThinkingForSummary(messages) {
  return messages.map((message2) => {
    if (message2.role !== "assistant" || !Array.isArray(message2.content)) return message2;
    return {
      ...message2,
      content: message2.content.filter((part) => part?.type !== "thinking")
    };
  });
}
function serializeMessagesForSummary(messages) {
  return serializeConversation(stripThinkingForSummary(convertToLlm(messages)));
}
function customMessageContentToText(content) {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  const parts = [];
  for (const part of content) {
    if (part?.type === "text" && typeof part.text === "string") parts.push(part.text);
    else if (part?.type === "image") parts.push(`[image${typeof part.mimeType === "string" ? ` ${part.mimeType}` : ""}]`);
    else if (part?.type) parts.push(`[${String(part.type)}]`);
  }
  return parts.join("\n").trim();
}
function buildSummaryPrompt(options) {
  const purposeText = options.purpose === "branch-summary" ? "the branch being left during /tree navigation" : options.purpose === "session-search" ? "the previous session being imported into the current context" : "the conversation span being compacted";
  const previous = options.previousSummary ? `<previous-summary>
${options.previousSummary}
</previous-summary>

` : "";
  const custom = options.customInstructions?.trim() ? `<custom-instructions>
${options.customInstructions.trim()}
</custom-instructions>

` : "";
  return `${custom}${previous}<conversation>
${options.conversationText}
</conversation>

Summarize ${purposeText} for a coding agent that must continue the work.

${compactionProfileInstructions(options.profile)}

Use this markdown shape:

## Goal
[What the user is trying to accomplish]

## Constraints & Preferences
- [Requirements, style, safety, or user preferences]

## Progress
### Done
- [x] [Completed work]

### In Progress
- [ ] [Current partial work]

### Blocked
- [Blockers or none]

## Key Decisions
- **[Decision]**: [Rationale]

## Files & Commands
- [Files read/modified and important commands/results]

## Next Steps
1. [Most important next action]

## Critical Context
- [Anything easy to lose but needed later]`;
}
async function summarizeWithRemote(endpoint, systemPrompt, promptText, maxTokens, signal) {
  const response = await fetch(endpoint, {
    body: JSON.stringify({ maxTokens, prompt: promptText, systemPrompt }),
    headers: { "content-type": "application/json" },
    method: "POST",
    signal
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`Remote compaction endpoint returned ${response.status}: ${text.slice(0, 500)}`);
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error("Remote compaction endpoint did not return JSON");
  }
  if (parsed && typeof parsed === "object") {
    const record = parsed;
    if (typeof record.summary === "string") return record.summary;
    if (typeof record.text === "string") return record.text;
  }
  throw new Error("Remote compaction response missing summary");
}
function resolveConfiguredModel(ctx, configured) {
  if (!configured || configured.trim().toLowerCase() === "current") return ctx.model;
  const withoutThinking = configured.replace(/:(off|minimal|low|medium|high|xhigh|max)$/i, "");
  const slash = withoutThinking.indexOf("/");
  if (slash > 0) return ctx.modelRegistry.find(withoutThinking.slice(0, slash), withoutThinking.slice(slash + 1));
  const providers = [ctx.model?.provider, "google", "openai", "anthropic", "mistral", "moonshot", "cloudflare-ai-gateway", "cloudflare-workers-ai"].filter((value) => typeof value === "string");
  for (const provider of providers) {
    const model = ctx.modelRegistry.find(provider, withoutThinking);
    if (model) return model;
  }
  return void 0;
}
function modelLabel(model) {
  return model ? `${model.provider}/${model.id}` : "unknown model";
}
function budgetMaxInputChars(ctx) {
  const raw = Math.floor(settingNumber("compaction.maxInputChars", DEFAULT_BUDGET_MAX_INPUT_CHARS, ctx.cwd));
  return raw <= 0 ? 0 : Math.max(2e4, raw);
}
async function singleShotSummary(ctx, request, options) {
  const promptText = buildSummaryPrompt({
    conversationText: request.text,
    customInstructions: request.customInstructions,
    previousSummary: settingBoolean("compaction.includePreviousSummary", true, ctx.cwd) ? request.previousSummary : void 0,
    profile: compactionProfile(ctx.cwd),
    purpose: options.purpose
  });
  const remoteEndpoint = settingString("compaction.remoteEndpoint", "", ctx.cwd);
  if (settingBoolean("compaction.remoteEnabled", false, ctx.cwd) && remoteEndpoint) {
    try {
      const summary2 = await summarizeWithRemote(remoteEndpoint, QOL_COMPACTION_SYSTEM_PROMPT, promptText, options.maxTokens, options.signal);
      return { model: remoteEndpoint, summary: summary2, via: "remote" };
    } catch (error) {
      compactionNotify(ctx, `Remote compaction failed, trying model fallback: ${stringifyError(error)}`, "warning");
    }
  }
  const configuredModel = options.model ?? settingString("compaction.model", DEFAULT_COMPACTION_MODEL, ctx.cwd);
  const model = resolveConfiguredModel(ctx, configuredModel);
  if (!model) throw new Error(`Summary model not found: ${configuredModel}`);
  const auth = await ctx.modelRegistry.getApiKeyAndHeaders(model);
  if (!auth.ok) throw new Error(auth.error);
  const message2 = {
    content: [{ text: promptText, type: "text" }],
    role: "user",
    timestamp: Date.now()
  };
  const response = await retryAssistantCallCompat(
    () => complete(
      model,
      { messages: [message2], systemPrompt: QOL_COMPACTION_SYSTEM_PROMPT },
      { apiKey: auth.apiKey, env: auth.env, headers: auth.headers, maxTokens: options.maxTokens, signal: options.signal, onPayload: gatewayPrivacyOnPayload(ctx) }
    ),
    options.signal,
    {
      onRetryScheduled: (attempt, maxAttempts, delayMs, errorMessage2) => {
        compactionNotify(ctx, `QOL compaction retry ${attempt}/${maxAttempts} in ${Math.ceil(delayMs / 1e3)}s: ${errorMessage2}`, "warning");
      }
    }
  );
  if (response.stopReason === "error" || response.stopReason === "aborted") {
    throw new Error(response.errorMessage || `Summary request stopped: ${response.stopReason}`);
  }
  if (response.stopReason === "length") {
    throw new Error("Summary generation hit the token cap and the summary is incomplete");
  }
  const summary = response.content.filter((content) => content.type === "text").map((content) => content.text).join("\n").trim();
  if (!summary) throw new Error("Summary model returned no text");
  return { model: modelLabel(model), summary, via: "model" };
}
async function generateQolSummary(ctx, options) {
  const maxTokens = Math.max(256, Math.floor(options.maxTokens ?? settingNumber("compaction.maxTokens", DEFAULT_COMPACTION_MAX_TOKENS, ctx.cwd)));
  const maxInputChars = budgetMaxInputChars(ctx);
  const summarize = (request) => singleShotSummary(ctx, request, {
    maxTokens,
    model: options.model,
    purpose: options.purpose,
    signal: options.signal
  });
  if (options.skipChunking || maxInputChars <= 0 || options.conversationText.length <= maxInputChars) {
    return summarize({
      customInstructions: options.customInstructions,
      previousSummary: options.previousSummary,
      skipChunking: true,
      text: options.conversationText
    });
  }
  const orchestrated = await orchestrateChunkedSummary({
    customInstructions: options.customInstructions,
    maxInputChars,
    notify: (message2, level = "info") => compactionNotify(ctx, message2, level),
    previousSummary: options.previousSummary,
    signal: options.signal,
    summarize,
    text: options.conversationText
  });
  return orchestrated;
}
function buildBudgetHandoff2(ctx, options) {
  return buildBudgetHandoff({
    preparation: options.preparation,
    reason: options.reason,
    sessionManager: ctx.sessionManager
  });
}
function writeBudgetHandoffArtifact2(ctx, handoff) {
  const enabled = settingBoolean("compaction.handoffArtifactEnabled", true, ctx.cwd);
  const result = writeBudgetHandoffArtifact(handoff, { cwd: ctx.cwd, enabled });
  if (result.error) {
    compactionNotify(ctx, `QOL handoff artifact write failed: ${result.error}`, "warning");
  }
  return result;
}
async function handleQolCompaction(event, ctx) {
  const isBudgetGuard = isBudgetGuardCompaction(event?.customInstructions);
  const nativeBlocked = gatewayPrivacyBlocksNativeSummary(ctx);
  const customEnabled = settingBoolean("compaction.customEnabled", false, ctx.cwd);
  if (!isBudgetGuard && !nativeBlocked && !customEnabled) return void 0;
  const preparation = event.preparation ?? {};
  const messages = [...preparation.messagesToSummarize ?? [], ...preparation.turnPrefixMessages ?? []];
  if (messages.length === 0) return void 0;
  const tokensBefore = typeof preparation.tokensBefore === "number" ? preparation.tokensBefore : 0;
  const handoffResult = isBudgetGuard || customEnabled ? writeBudgetHandoffArtifact2(ctx, buildBudgetHandoff2(ctx, { preparation, reason: event.customInstructions ?? "session_before_compact" })) : {};
  const sourceLabel = isBudgetGuard ? "pi-qol budget-guard" : "pi-qol";
  compactionNotify(ctx, `QOL compaction: summarizing ${messages.length} message(s), ${tokensBefore.toLocaleString()} token(s)${isBudgetGuard ? " (budget guard)" : ""}.`, "info");
  try {
    const conversationText = serializeMessagesForSummary(messages);
    const result = await generateQolSummary(ctx, {
      conversationText,
      customInstructions: event.customInstructions,
      previousSummary: preparation.previousSummary,
      purpose: "compaction",
      signal: event.signal
    });
    if (!result.summary.trim()) throw new Error("Compaction summary was empty");
    const chunkSuffix = result.chunkCount && result.chunkCount > 1 ? ` (${result.chunkCount} chunks, ${result.reduceLevels ?? 1} reduce level${(result.reduceLevels ?? 1) === 1 ? "" : "s"})` : "";
    compactionNotify(ctx, `QOL compaction complete via ${result.via}: ${result.model}${chunkSuffix}`, "info");
    return {
      compaction: {
        details: {
          chunkCount: result.chunkCount,
          handoffArtifact: handoffResult.path,
          handoffArtifactLatest: handoffResult.latestPath,
          handoffArtifactError: handoffResult.error,
          messageCount: messages.length,
          model: result.model,
          profile: compactionProfile(ctx.cwd),
          reduceLevels: result.reduceLevels,
          requestCount: result.requestCount,
          source: sourceLabel,
          trigger: isBudgetGuard ? "budget-guard" : "session_before_compact",
          via: result.via
        },
        firstKeptEntryId: preparation.firstKeptEntryId,
        summary: result.summary,
        tokensBefore: preparation.tokensBefore
      }
    };
  } catch (error) {
    if (event.signal?.aborted) return void 0;
    compactionNotify(ctx, `QOL compaction failed: ${stringifyError(error)}`, "error", nativeBlocked);
    return !nativeBlocked && settingBoolean("compaction.fallbackToDefault", true, ctx.cwd) ? void 0 : { cancel: true };
  }
}
function summarizeEntryForBranch(entry) {
  if (entry?.type === "message" && entry.message) return [serializeMessagesForSummary([entry.message])];
  if (entry?.type === "compaction" && typeof entry.summary === "string") return [`[Compaction summary]: ${entry.summary}`];
  if (entry?.type === "branch_summary" && typeof entry.summary === "string") return [`[Branch summary]: ${entry.summary}`];
  if (entry?.type === "custom_message") return [`[Custom message${entry.customType ? `:${entry.customType}` : ""}]: ${customMessageContentToText(entry.content) || "[empty]"}`];
  return [];
}
async function handleQolBranchSummary(event, ctx) {
  const nativeBlocked = gatewayPrivacyBlocksNativeSummary(ctx);
  if (!nativeBlocked && !settingBoolean("compaction.branchSummaryEnabled", false, ctx.cwd)) return void 0;
  const preparation = event.preparation ?? {};
  if (preparation.userWantsSummary !== true) return void 0;
  const entries = Array.isArray(preparation.entriesToSummarize) ? preparation.entriesToSummarize : [];
  const conversationText = entries.flatMap(summarizeEntryForBranch).join("\n\n").trim();
  if (!conversationText) return void 0;
  compactionNotify(ctx, `QOL branch summary: summarizing ${entries.length} entr${entries.length === 1 ? "y" : "ies"}.`, "info");
  try {
    const result = await generateQolSummary(ctx, {
      conversationText,
      customInstructions: event.customInstructions ?? preparation.customInstructions,
      purpose: "branch-summary",
      signal: event.signal
    });
    if (!result.summary.trim()) throw new Error("Branch summary was empty");
    return {
      summary: {
        details: { entryCount: entries.length, model: result.model, profile: compactionProfile(ctx.cwd), source: "pi-qol", via: result.via },
        summary: result.summary
      }
    };
  } catch (error) {
    if (event.signal?.aborted) return void 0;
    compactionNotify(ctx, `QOL branch summary failed: ${stringifyError(error)}`, "error", nativeBlocked);
    return nativeBlocked ? { cancel: true } : void 0;
  }
}
function contextUsage(ctx) {
  const usage = ctx.getContextUsage?.();
  const tokens = Number(usage?.tokens);
  if (!Number.isFinite(tokens) || tokens <= 0) return void 0;
  const contextWindow = Number(usage?.contextWindow ?? ctx.model?.contextWindow);
  return { contextWindow: Number.isFinite(contextWindow) && contextWindow > 0 ? contextWindow : void 0, tokens };
}
function compactionTriggerReason(ctx) {
  const usage = contextUsage(ctx);
  if (!usage) return void 0;
  const tokenLimit = settingNumber("compaction.thresholdTokens", -1, ctx.cwd);
  if (tokenLimit > 0 && usage.tokens >= tokenLimit) return `${usage.tokens.toLocaleString()} tokens >= ${Math.floor(tokenLimit).toLocaleString()} token limit`;
  const percentLimit = settingNumber("compaction.thresholdPercent", -1, ctx.cwd);
  if (percentLimit > 0 && usage.contextWindow) {
    const percent = usage.tokens / usage.contextWindow * 100;
    if (percent >= percentLimit) return `${percent.toFixed(1)}% context >= ${percentLimit}% limit`;
  }
  const idleLimit = settingNumber("compaction.idleThresholdTokens", DEFAULT_IDLE_COMPACTION_THRESHOLD_TOKENS, ctx.cwd);
  if (usage.tokens >= idleLimit) return `${usage.tokens.toLocaleString()} tokens >= ${Math.floor(idleLimit).toLocaleString()} idle threshold`;
  return void 0;
}
var AUTO_COMPACTION_SWITCHES = {
  budgetGuard: { key: "compaction.budgetGuardEnabled", fallback: true },
  idle: { key: "compaction.idleEnabled", fallback: false }
};
function autoCompactionGate(trigger, cwd) {
  if (!piCompactionEnabled(cwd)) return "pi-compaction-disabled";
  const { key, fallback } = AUTO_COMPACTION_SWITCHES[trigger];
  return settingBoolean(key, fallback, cwd) ? "enabled" : "disabled";
}
function budgetGuardTrigger(ctx) {
  if (autoCompactionGate("budgetGuard", ctx.cwd) !== "enabled") return void 0;
  const usage = contextUsage(ctx);
  if (!usage) return void 0;
  return computeBudgetTrigger({
    contextWindow: usage.contextWindow,
    enabled: true,
    percentLimit: settingNumber("compaction.budgetPercent", DEFAULT_BUDGET_GUARD_PERCENT, ctx.cwd),
    tokenLimit: settingNumber("compaction.budgetTokens", DEFAULT_BUDGET_GUARD_TOKENS, ctx.cwd),
    tokens: usage.tokens
  });
}

// src/extensions/qol/context-usage.ts
import { existsSync as existsSync2, readFileSync as readFileSync3 } from "node:fs";
import { isAbsolute } from "node:path";
import { truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";

// src/extensions/qol/transcript-risk.ts
import { convertToLlm as convertToLlm2, serializeConversation as serializeConversation2 } from "@earendil-works/pi-coding-agent";
function stripThinking(messages) {
  return messages.map((message2) => {
    if (message2.role !== "assistant" || !Array.isArray(message2.content)) return message2;
    return { ...message2, content: message2.content.filter((part) => part?.type !== "thinking") };
  });
}
function transcriptRiskState(messages, threshold) {
  if (!Array.isArray(messages) || messages.length === 0 || threshold <= 0) {
    return { chars: 0, exceeded: false, messageCount: messages?.length ?? 0, threshold };
  }
  try {
    const serialized = serializeConversation2(stripThinking(convertToLlm2(messages)));
    return evaluateTranscriptRisk({ chars: serialized.length, messageCount: messages.length, threshold });
  } catch (error) {
    const message2 = error instanceof Error ? error.message : String(error);
    return evaluateTranscriptRisk({ chars: 0, error: message2, messageCount: messages.length, threshold });
  }
}

// src/extensions/qol/context-usage.ts
function qcuSafeString(value) {
  if (typeof value === "string") return value;
  if (value == null) return "";
  const seen = /* @__PURE__ */ new WeakSet();
  try {
    return JSON.stringify(value, (_key, current) => {
      if (typeof current === "function") return void 0;
      if (typeof current === "object" && current !== null) {
        if (seen.has(current)) return "[Circular]";
        seen.add(current);
      }
      return current;
    }) ?? "";
  } catch {
    return String(value);
  }
}
function qcuEstimateTokens(value) {
  const text = qcuSafeString(value);
  if (!text) return 0;
  return Math.max(1, Math.ceil(text.length / 4));
}
function qcuFormatTokens(value) {
  const n = Math.max(0, Math.round(Number(value) || 0));
  const trim = (input) => input.toFixed(input >= 10 ? 0 : 1).replace(/\.0$/, "");
  if (n >= 1e6) return `${trim(n / 1e6)}M`;
  if (n >= 1e3) return `${trim(n / 1e3)}K`;
  return n.toLocaleString();
}
function qcuPercent(tokens, contextWindow) {
  if (!contextWindow || contextWindow <= 0) return "--";
  return `${(tokens / contextWindow * 100).toFixed(1)}%`;
}
function qcuPadAnsi(text, width) {
  const clipped = truncateToWidth(text, Math.max(0, width), "");
  return `${clipped}${" ".repeat(Math.max(0, width - visibleWidth(clipped)))}`;
}
function qcuOneLine(text, maxWidth) {
  return truncateToWidth(text.replace(/[\r\n\t]+/g, " ").replace(/\s+/g, " ").trim(), maxWidth, "\u2026");
}
function qcuDetailLabel(item, fallback) {
  if (typeof item === "string") return qcuOneLine(item, 90) || fallback;
  if (!item || typeof item !== "object") return fallback;
  const obj = item;
  const raw = obj.name ?? obj.title ?? obj.label ?? obj.id ?? obj.path ?? obj.file ?? obj.filePath ?? obj.sourcePath ?? obj.description ?? fallback;
  const label = typeof raw === "string" ? raw : fallback;
  return qcuOneLine(label, 90) || fallback;
}
function qcuDetailText(item) {
  if (typeof item === "string") return item;
  if (!item || typeof item !== "object") return qcuSafeString(item);
  const obj = item;
  const direct = obj.content ?? obj.text ?? obj.markdown ?? obj.body ?? obj.instructions ?? obj.description ?? obj.prompt;
  if (typeof direct === "string") return direct;
  const pathValue = obj.path ?? obj.file ?? obj.filePath ?? obj.sourcePath;
  if (typeof pathValue === "string" && isAbsolute(pathValue) && existsSync2(pathValue)) {
    try {
      return readFileSync3(pathValue, "utf8");
    } catch {
    }
  }
  return qcuSafeString(item);
}
function qcuDetailsFromItems(items, fallbackGroup) {
  return items.map((item, index) => {
    const obj = item && typeof item === "object" ? item : void 0;
    const sourceInfo = obj?.sourceInfo && typeof obj.sourceInfo === "object" ? obj.sourceInfo : void 0;
    const group = typeof obj?.scope === "string" ? obj.scope : typeof sourceInfo?.scope === "string" ? sourceInfo.scope : typeof sourceInfo?.source === "string" ? sourceInfo.source : fallbackGroup;
    const description = typeof obj?.description === "string" ? obj.description : void 0;
    return {
      description: description ? qcuOneLine(description, 120) : void 0,
      group,
      label: qcuDetailLabel(item, `item-${index + 1}`),
      tokens: qcuEstimateTokens(qcuDetailText(item))
    };
  }).filter((item) => item.tokens > 0 || item.label.length > 0);
}
function qcuPromptOptionArray(options, keys) {
  if (!options || typeof options !== "object") return [];
  const obj = options;
  for (const key of keys) {
    const value = obj[key];
    if (Array.isArray(value)) return value;
  }
  return [];
}
function qcuUniqDetails(items) {
  const byLabel = /* @__PURE__ */ new Map();
  for (const item of items) {
    const key = `${item.group ?? ""}:${item.label}`;
    const existing = byLabel.get(key);
    if (!existing || item.tokens > existing.tokens) byLabel.set(key, item);
  }
  return Array.from(byLabel.values()).sort((a, b) => b.tokens - a.tokens || a.label.localeCompare(b.label));
}
function qcuTokenSum(items) {
  return items.reduce((sum, item) => sum + Math.max(0, item.tokens), 0);
}
function qcuMessageTokens(message2) {
  if (!message2 || typeof message2 !== "object") return 0;
  if (message2.role === "bashExecution" && message2.excludeFromContext === true) return 0;
  if (message2.role === "compactionSummary") return qcuEstimateTokens(message2.summary ?? "");
  if (message2.role === "branchSummary") return qcuEstimateTokens(message2.summary ?? "");
  if (message2.role === "custom") return qcuEstimateTokens(message2.content ?? "");
  const content = message2.content;
  if (typeof content === "string") return qcuEstimateTokens(content);
  if (!Array.isArray(content)) return qcuEstimateTokens(content);
  return content.reduce((sum, part) => {
    if (part?.type === "text") return sum + qcuEstimateTokens(part.text ?? "");
    if (part?.type === "thinking") return sum + qcuEstimateTokens(part.thinking ?? "");
    if (part?.type === "toolCall") return sum + qcuEstimateTokens(part);
    if (part?.type === "image") return sum + 85;
    return sum + qcuEstimateTokens(part);
  }, 0);
}
function qcuBuildMessageStats(ctx) {
  const sm = ctx.sessionManager;
  const branch = Array.isArray(sm.getBranch?.()) ? sm.getBranch() : [];
  const built = typeof sm.buildSessionContext === "function" ? sm.buildSessionContext() : void 0;
  const messages = Array.isArray(built?.messages) ? built.messages : branch.filter((entry) => entry?.type === "message").map((entry) => entry.message);
  const stats = { assistant: 0, bash: 0, branchEntries: branch.length, compact: 0, contextMessages: messages.length, custom: 0, toolResult: 0, user: 0 };
  let rawMessageTokens = 0;
  let rawCompactTokens = 0;
  for (const message2 of messages) {
    const tokens = qcuMessageTokens(message2);
    switch (message2?.role) {
      case "user":
        stats.user += 1;
        rawMessageTokens += tokens;
        break;
      case "assistant":
        stats.assistant += 1;
        rawMessageTokens += tokens;
        break;
      case "toolResult":
        stats.toolResult += 1;
        rawMessageTokens += tokens;
        break;
      case "bashExecution":
        stats.bash += 1;
        rawMessageTokens += tokens;
        break;
      case "custom":
        stats.custom += 1;
        rawMessageTokens += tokens;
        break;
      case "compactionSummary":
      case "branchSummary":
        stats.compact += 1;
        rawCompactTokens += tokens;
        break;
      default:
        rawMessageTokens += tokens;
    }
  }
  const compactSummaries = branch.filter((entry) => entry?.type === "compaction" || entry?.type === "branch_summary").map((entry) => ({
    group: entry.type === "compaction" ? "compaction" : "branch",
    label: entry.type === "compaction" ? `Compaction${entry.tokensBefore ? ` (${qcuFormatTokens(Number(entry.tokensBefore))} before)` : ""}` : "Branch summary",
    tokens: qcuEstimateTokens(entry.summary ?? "")
  })).reverse();
  return { compactSummaries, rawCompactTokens, rawMessageTokens, stats };
}
function qcuToolDetails(pi) {
  const api = pi;
  const activeNames = new Set(Array.isArray(api.getActiveTools?.()) ? api.getActiveTools() : []);
  const allTools = Array.isArray(api.getAllTools?.()) ? api.getAllTools() : [];
  const activeTools = allTools.filter((tool) => typeof tool?.name === "string" && (activeNames.size === 0 || activeNames.has(tool.name)));
  const details = activeTools.map((tool) => {
    const sourceInfo = tool.sourceInfo && typeof tool.sourceInfo === "object" ? tool.sourceInfo : void 0;
    const source = typeof sourceInfo?.source === "string" ? sourceInfo.source : void 0;
    return {
      description: typeof tool.description === "string" ? qcuOneLine(tool.description, 120) : void 0,
      group: source,
      label: tool.name,
      tokens: qcuEstimateTokens({ description: tool.description, name: tool.name, parameters: tool.parameters, promptGuidelines: tool.promptGuidelines, promptSnippet: tool.promptSnippet })
    };
  });
  const isMcpTool = (tool) => /^mcp_{1,2}/i.test(tool.label) || /mcp/i.test(tool.group ?? "");
  const mcpTools = details.filter(isMcpTool);
  const builtinTools = details.filter((tool) => !isMcpTool(tool) && (tool.group === "builtin" || tool.group === "sdk"));
  const extensionTools = details.filter((tool) => !isMcpTool(tool) && tool.group !== "builtin" && tool.group !== "sdk");
  return {
    builtinTools: qcuUniqDetails(builtinTools),
    extensionTools: qcuUniqDetails(extensionTools),
    mcpTools: qcuUniqDetails(mcpTools),
    rawBuiltinToolTokens: qcuTokenSum(builtinTools),
    rawExtensionToolTokens: qcuTokenSum(extensionTools),
    rawMcpToolTokens: qcuTokenSum(mcpTools)
  };
}
function qcuSkillDetails(pi, promptOptions) {
  const fromOptions = qcuDetailsFromItems(qcuPromptOptionArray(promptOptions, ["skills", "loadedSkills", "availableSkills"]), "loaded");
  const commands = Array.isArray(pi.getCommands?.()) ? pi.getCommands() : [];
  const fromCommands = commands.filter((command) => command?.source === "skill").map((command) => {
    const sourceInfo = command.sourceInfo && typeof command.sourceInfo === "object" ? command.sourceInfo : void 0;
    return {
      description: typeof command.description === "string" ? qcuOneLine(command.description, 120) : void 0,
      group: typeof sourceInfo?.scope === "string" ? sourceInfo.scope : typeof sourceInfo?.source === "string" ? sourceInfo.source : "skill",
      label: String(command.name ?? "skill").replace(/^skill:/, ""),
      tokens: qcuEstimateTokens(`${command.name ?? ""}
${command.description ?? ""}`)
    };
  });
  return qcuUniqDetails([...fromOptions, ...fromCommands]);
}
function qcuScaleCategories(rawCategories, totalTokens, contextWindow) {
  const rawTotal = rawCategories.reduce((sum, category) => sum + Math.max(0, category.rawTokens), 0);
  if (rawTotal <= 0) {
    return [{ color: "accent", icon: "\u25C9", key: "messages", label: "Messages", rawTokens: totalTokens, tokens: totalTokens }];
  }
  const ratio = totalTokens / rawTotal;
  const categories = rawCategories.map((category) => ({ ...category, tokens: Math.max(0, Math.round(category.rawTokens * ratio)) })).filter((category) => category.tokens > 0 || category.rawTokens > 0);
  const scaledTotal = categories.reduce((sum, category) => sum + category.tokens, 0);
  const delta = totalTokens - scaledTotal;
  const messages = categories.find((category) => category.key === "messages") ?? categories[categories.length - 1];
  if (messages && delta !== 0) messages.tokens = Math.max(0, messages.tokens + delta);
  const used = categories.reduce((sum, category) => sum + category.tokens, 0);
  if (contextWindow && used < totalTokens) {
    const other = totalTokens - used;
    if (other > 0) categories.push({ color: "dim", icon: "\u25C9", key: "other", label: "Other", rawTokens: other, tokens: other });
  }
  return categories;
}
function qcuExtractProjectAgents(systemPrompt) {
  const marker = systemPrompt.includes("## Project Agents") ? "## Project Agents" : "## Project Subagents";
  const start = systemPrompt.indexOf(marker);
  if (start < 0) return { agents: [], tokens: 0 };
  const rest = systemPrompt.slice(start);
  const next = rest.slice(marker.length).search(/\n##\s+/);
  const section = next >= 0 ? rest.slice(0, marker.length + next) : rest;
  const agents = section.split(/\r?\n/).filter((line) => line.startsWith("- ")).map((line) => {
    const match = line.match(/^-\s*([^:]+):\s*(.*?)(?:\s*\(([^)]*)\))?$/);
    return {
      description: match?.[2] ? qcuOneLine(match[2], 120) : void 0,
      group: match?.[3]?.includes("project") ? "project" : match?.[3]?.includes("user") ? "user" : "agent",
      label: qcuOneLine(match?.[1] ?? line.replace(/^[-\s]+/, ""), 90),
      tokens: qcuEstimateTokens(line)
    };
  });
  return { agents: qcuUniqDetails(agents), tokens: qcuEstimateTokens(section) };
}
function qcuMessagesForRisk(ctx) {
  const sm = ctx.sessionManager;
  const built = typeof sm.buildSessionContext === "function" ? sm.buildSessionContext() : void 0;
  if (Array.isArray(built?.messages)) return built.messages;
  const branch = Array.isArray(sm.getBranch?.()) ? sm.getBranch() : [];
  return branch.filter((entry) => entry?.type === "message").map((entry) => entry.message);
}
function buildQolContextUsageDetails(pi, ctx, promptOptions) {
  const usage = ctx.getContextUsage?.();
  const tokens = Number(usage?.tokens);
  if (!Number.isFinite(tokens) || tokens <= 0) return void 0;
  const model = ctx.model ?? {};
  const contextWindow = Number(usage?.contextWindow ?? model.contextWindow);
  const safeContextWindow = Number.isFinite(contextWindow) && contextWindow > 0 ? contextWindow : void 0;
  const percent = Number(usage?.percent);
  const systemPrompt = ctx.getSystemPrompt?.() ?? "";
  const contextFiles = qcuUniqDetails(qcuDetailsFromItems(qcuPromptOptionArray(promptOptions, ["contextFiles", "agentsFiles", "memoryFiles"]), "context"));
  const skills = qcuSkillDetails(pi, promptOptions);
  const extractedAgents = qcuExtractProjectAgents(systemPrompt);
  const customAgents = qcuUniqDetails([...qcuDetailsFromItems(qcuPromptOptionArray(promptOptions, ["customAgents", "agents", "agentSnippets"]), "agent"), ...extractedAgents.agents]);
  const { builtinTools, extensionTools, mcpTools, rawBuiltinToolTokens, rawExtensionToolTokens, rawMcpToolTokens } = qcuToolDetails(pi);
  const { compactSummaries, rawCompactTokens, rawMessageTokens, stats } = qcuBuildMessageStats(ctx);
  const rawCompactSummaryTokens = rawCompactTokens > 0 ? rawCompactTokens : qcuTokenSum(compactSummaries);
  const rawContextFiles = qcuTokenSum(contextFiles);
  const rawSkills = qcuTokenSum(skills);
  const rawCustomAgents = Math.max(qcuTokenSum(customAgents), extractedAgents.tokens);
  const rawSystemPromptTotal = qcuEstimateTokens(systemPrompt);
  const rawSystemPrompt = Math.max(0, rawSystemPromptTotal - rawContextFiles - rawSkills - rawCustomAgents);
  const categories = qcuScaleCategories([
    { color: "muted", icon: "\u25C9", key: "system", label: "System prompt", rawTokens: rawSystemPrompt },
    { color: "warning", icon: "\u25C9", key: "builtinTools", label: "Built-in tools", rawTokens: rawBuiltinToolTokens },
    { color: "error", icon: "\u25C9", key: "extensionTools", label: "Extension tools", rawTokens: rawExtensionToolTokens },
    { color: "warning", icon: "\u25C9", key: "mcpTools", label: "MCP tools", rawTokens: rawMcpToolTokens },
    { color: "success", icon: "\u25C9", key: "agents", label: "Custom agents", rawTokens: rawCustomAgents },
    { color: "error", icon: "\u25C9", key: "contextFiles", label: "Context / memory files", rawTokens: rawContextFiles },
    { color: "success", icon: "\u25C9", key: "skills", label: "Skills", rawTokens: rawSkills },
    { color: "accent", icon: "\u25C9", key: "messages", label: "Messages", rawTokens: rawMessageTokens },
    { color: "muted", icon: "\u25C9", key: "compact", label: "Compact buffer", rawTokens: rawCompactSummaryTokens }
  ], tokens, safeContextWindow);
  const modelProvider = typeof model.provider === "string" ? model.provider : "unknown";
  const modelId = typeof model.id === "string" ? model.id : typeof model.model === "string" ? model.model : "unknown";
  const modelName = typeof model.name === "string" ? model.name : modelId;
  const thinking = typeof pi.getThinkingLevel === "function" ? pi.getThinkingLevel() : void 0;
  const transcriptThreshold = Math.floor(settingNumber("compaction.transcriptRiskWarnChars", DEFAULT_TRANSCRIPT_RISK_WARN_CHARS, ctx.cwd));
  const transcriptRisk = transcriptRiskState(qcuMessagesForRisk(ctx), transcriptThreshold);
  return {
    builtinTools,
    categories,
    compactSummaries,
    contextFiles,
    customAgents,
    extensionTools,
    freeTokens: safeContextWindow ? Math.max(0, safeContextWindow - tokens) : void 0,
    mcpTools,
    messageStats: stats,
    transcriptRisk: transcriptRisk.chars > 0 || transcriptRisk.error ? transcriptRisk : void 0,
    model: {
      contextWindow: safeContextWindow,
      id: modelId,
      label: modelName,
      provider: modelProvider,
      thinking: typeof thinking === "string" && thinking !== "off" ? thinking : void 0
    },
    note: promptOptions ? void 0 : "Context-file and skill breakdowns become more precise after the next agent turn.",
    skills,
    usage: {
      contextWindow: safeContextWindow,
      percent: Number.isFinite(percent) ? percent : safeContextWindow ? tokens / safeContextWindow * 100 : void 0,
      tokens
    }
  };
}
function qcuLimitDetails(items, limit) {
  return items.slice(0, Math.max(0, limit));
}
function qcuBranch(theme, branch) {
  if (branch === "\u2502") return theme.fg("muted", "\u2502  ");
  return theme.fg("muted", `${branch}\u2500 `);
}
function qcuStem(theme, isLast) {
  return isLast ? theme.fg("borderMuted", "   ") : qcuBranch(theme, "\u2502");
}
function qcuRenderDetailSection(lines, title, items, theme, options = {}) {
  if (items.length === 0) {
    if (options.empty) {
      lines.push("");
      lines.push(`${theme.fg("customMessageLabel", theme.bold(title))}`);
      lines.push(`${qcuBranch(theme, "\u2514")}${theme.fg("dim", options.empty)}`);
    }
    return;
  }
  const visible = qcuLimitDetails(items, options.limit ?? 10);
  lines.push("");
  lines.push(`${theme.fg("customMessageLabel", theme.bold(title))}`);
  visible.forEach((item, index) => {
    const isLast = index === visible.length - 1 && visible.length === items.length;
    const branch = isLast ? "\u2514" : "\u251C";
    const group = item.group ? theme.fg("dim", ` ${item.group}`) : "";
    lines.push(`${qcuBranch(theme, branch)}${theme.fg("text", qcuOneLine(item.label, 72))}: ${theme.fg("accent", qcuFormatTokens(item.tokens))} tokens${group}`);
    if (options.showDescriptions && item.description) lines.push(`${qcuStem(theme, isLast)}${theme.fg("dim", qcuOneLine(item.description, 100))}`);
  });
  if (items.length > visible.length) lines.push(`${qcuBranch(theme, "\u2514")}${theme.fg("dim", `\u2026 ${items.length - visible.length} more`)}`);
}
function renderQolContextUsageMessage(message2, _options, theme) {
  const details = message2?.details;
  return {
    invalidate() {
    },
    render(width) {
      if (!details) return [theme.fg("warning", "Context usage details unavailable.")];
      const safeWidth = Math.max(48, width);
      const lines = [];
      lines.push(`${theme.fg("accent", "\u203A /context")}`);
      lines.push(`\u2514 ${theme.fg("customMessageLabel", theme.bold("Context Usage"))}`);
      const gridCols = safeWidth >= 112 ? 28 : safeWidth >= 88 ? 22 : 16;
      const gridRows = safeWidth >= 88 ? 7 : 6;
      const totalBlocks = gridCols * gridRows;
      const contextWindow = details.usage.contextWindow;
      const gridDenominator = contextWindow ?? details.usage.tokens;
      const blockCategories = [];
      for (const category of details.categories) {
        if (!gridDenominator || category.tokens <= 0) continue;
        let count = Math.round(category.tokens / gridDenominator * totalBlocks);
        if (count === 0 && category.tokens > 0) count = 1;
        for (let index = 0; index < count && blockCategories.length < totalBlocks; index += 1) blockCategories.push(category);
      }
      const gridLines = [];
      for (let row = 0; row < gridRows; row += 1) {
        let line = "";
        for (let col = 0; col < gridCols; col += 1) {
          const category = blockCategories[row * gridCols + col];
          line += category ? theme.fg(category.color, category.icon) : theme.fg("borderMuted", "\u25A1");
          if (col !== gridCols - 1) line += " ";
        }
        gridLines.push(line);
      }
      const modelBits = [`${details.model.provider}/${details.model.id}`];
      if (details.model.thinking) modelBits.push(`thinking ${details.model.thinking}`);
      const summaryLines = [
        `${theme.fg("text", theme.bold(details.model.label))}${contextWindow ? theme.fg("muted", ` (${qcuFormatTokens(contextWindow)} context)`) : ""}`,
        theme.fg("muted", modelBits.join(" \xB7 ")),
        `${theme.fg("accent", qcuFormatTokens(details.usage.tokens))}${contextWindow ? `/${qcuFormatTokens(contextWindow)}` : ""} tokens${details.usage.percent != null ? ` (${details.usage.percent.toFixed(1)}%)` : ""}`,
        "",
        theme.fg("muted", theme.italic("Estimated usage by category")),
        ...details.categories.map((category) => `${theme.fg(category.color, category.icon)} ${theme.fg("text", `${category.label}:`)} ${qcuFormatTokens(category.tokens)} tokens ${theme.fg("muted", `(${qcuPercent(category.tokens, contextWindow)})`)}`)
      ];
      if (details.freeTokens != null) summaryLines.push(`${theme.fg("borderMuted", "\u25A1")} ${theme.fg("text", "Free space:")} ${qcuFormatTokens(details.freeTokens)} ${theme.fg("muted", `(${qcuPercent(details.freeTokens, contextWindow)})`)}`);
      lines.push("");
      if (safeWidth >= 82) {
        const leftWidth = visibleWidth(gridLines[0] ?? "");
        const maxRows = Math.max(gridLines.length, summaryLines.length);
        for (let index = 0; index < maxRows; index += 1) {
          lines.push(`  ${qcuPadAnsi(gridLines[index] ?? "", leftWidth)}    ${summaryLines[index] ?? ""}`.trimEnd());
        }
      } else {
        lines.push(...gridLines.map((line) => `  ${line}`));
        lines.push("");
        lines.push(...summaryLines.map((line) => `  ${line}`));
      }
      if (details.note) lines.push("", theme.fg("dim", details.note));
      const messageStats = details.messageStats;
      lines.push("");
      lines.push(`${theme.fg("customMessageLabel", theme.bold("Conversation"))}`);
      lines.push(`${qcuBranch(theme, "\u251C")}context messages: ${theme.fg("accent", String(messageStats.contextMessages))} ${theme.fg("dim", `(${messageStats.branchEntries} branch entries)`)}`);
      lines.push(`${qcuBranch(theme, "\u251C")}user: ${messageStats.user} \xB7 assistant: ${messageStats.assistant} \xB7 tool results: ${messageStats.toolResult}`);
      lines.push(`${qcuBranch(theme, "\u2514")}bash: ${messageStats.bash} \xB7 custom: ${messageStats.custom} \xB7 compact summaries: ${messageStats.compact}`);
      qcuRenderDetailSection(lines, "MCP tools", details.mcpTools, theme, { empty: void 0, limit: 12, showDescriptions: false });
      qcuRenderDetailSection(lines, "Built-in tools", details.builtinTools, theme, { limit: details.mcpTools.length > 0 ? 8 : 12, showDescriptions: false });
      qcuRenderDetailSection(lines, "Extension tools", details.extensionTools, theme, { limit: 12, showDescriptions: false });
      qcuRenderDetailSection(lines, "Custom agents \xB7 /agents", details.customAgents, theme, { limit: 12, showDescriptions: false });
      qcuRenderDetailSection(lines, "Context / memory files", details.contextFiles, theme, { limit: 12, showDescriptions: false });
      qcuRenderDetailSection(lines, "Skills \xB7 /skills", details.skills, theme, { empty: "No skill commands discovered.", limit: 14, showDescriptions: false });
      qcuRenderDetailSection(lines, "Compact buffer", details.compactSummaries, theme, { limit: 6, showDescriptions: false });
      if (details.transcriptRisk?.error) {
        const r = details.transcriptRisk;
        const safe = r.error.replace(/[\x00-\x1f]+/g, " ").slice(0, 200);
        lines.push("");
        lines.push(`${theme.fg("warning", theme.bold("Transcript risk"))}`);
        lines.push(`${qcuBranch(theme, "\u2514")}${theme.fg("warning", `risk calculation failed: ${safe}`)}`);
      } else if (details.transcriptRisk?.exceeded) {
        const r = details.transcriptRisk;
        lines.push("");
        lines.push(`${theme.fg("warning", theme.bold("Transcript risk"))}`);
        lines.push(`${qcuBranch(theme, "\u251C")}${theme.fg("warning", `serialized payload ${qcuFormatTokens(Math.ceil(r.chars / 4))} tokens (${r.chars.toLocaleString()} chars) >= ${r.threshold.toLocaleString()} char warn budget`)}`);
        lines.push(`${qcuBranch(theme, "\u2514")}${theme.fg("muted", "compact soon or raise compaction.transcriptRiskWarnChars to silence")}`);
      } else if (details.transcriptRisk && details.transcriptRisk.chars > 0) {
        const r = details.transcriptRisk;
        lines.push("");
        lines.push(`${theme.fg("muted", `Transcript payload: ${qcuFormatTokens(Math.ceil(r.chars / 4))} tokens (${r.chars.toLocaleString()} chars / ${r.threshold.toLocaleString()} warn budget).`)}`);
      }
      return lines.map((line) => truncateToWidth(line, safeWidth, ""));
    }
  };
}

// src/extensions/qol/editor.ts
import { CustomEditor } from "@earendil-works/pi-coding-agent";
import { matchesKey, truncateToWidth as truncateToWidth2, visibleWidth as visibleWidth2 } from "@earendil-works/pi-tui";

// src/extensions/qol/glyphs.ts
var LOCAL_CONFIG_ID = "@vanillagreen/pi-qol";
var GLOBAL_CONFIG_ID = "@vanillagreen/pi-tool-renderer";
function asGlyphStyle(value) {
  return value === "unicode" || value === "ascii" ? value : void 0;
}
function glyphStyle(cwd) {
  const globalOverride = readPackageConfig(GLOBAL_CONFIG_ID, cwd).globalGlyphStyleOverride;
  const forced = asGlyphStyle(globalOverride);
  if (forced) return forced;
  const local = readPackageConfig(LOCAL_CONFIG_ID, cwd);
  return asGlyphStyle(local.glyphStyle) ?? asGlyphStyle(local.treeStyle) ?? "unicode";
}
var GLYPHS = {
  unicode: {
    frame: { tl: "\u250F", tr: "\u2513", bl: "\u2517", br: "\u251B", h: "\u2501", v: "\u2503" },
    line: "\u2500",
    tree: { mid: "\u251C\u2500 ", last: "\u2514\u2500 ", stem: "\u2502  ", blank: "   " },
    bullet: "\u25CF ",
    emptyBullet: "\u25CB ",
    dot: " \xB7 ",
    ok: "\u2713",
    fail: "\u2717",
    warn: "\u25B2",
    diamond: "\u25C6",
    prompt: "\u03C0",
    ellipsis: "\u2026",
    arrow: "\u2192",
    codeBar: "\u258C"
  },
  ascii: {
    frame: { tl: "+", tr: "+", bl: "+", br: "+", h: "-", v: "|" },
    line: "-",
    tree: { mid: "|-- ", last: "`-- ", stem: "|  ", blank: "   " },
    bullet: "* ",
    emptyBullet: "o ",
    dot: " - ",
    ok: "+",
    fail: "x",
    warn: "!",
    diamond: "*",
    prompt: "pi",
    ellipsis: "...",
    arrow: "->",
    codeBar: "|"
  }
};
function glyphs(cwd) {
  return GLYPHS[glyphStyle(cwd)];
}

// src/extensions/qol/images.ts
import { existsSync as existsSync3 } from "node:fs";
import { open } from "node:fs/promises";
import { basename as basename2, resolve as resolve2 } from "node:path";
function stripAtPrefix(path) {
  return path.startsWith("@") ? path.slice(1) : path;
}
function resolveMaybeImagePath(path, cwd) {
  const clean = stripAtPrefix(path);
  const expanded = expandHome(clean);
  const resolved = expanded.startsWith("/") ? expanded : resolve2(cwd, expanded);
  const lower = resolved.toLowerCase();
  const dot = lower.lastIndexOf(".");
  if (dot < 0 || !IMAGE_EXTENSIONS.has(lower.slice(dot))) return void 0;
  if (!existsSync3(resolved)) return void 0;
  return resolved;
}
function imagePathLabels(text, cwd) {
  const seen = /* @__PURE__ */ new Set();
  for (const match of text.matchAll(IMAGE_PATH_PATTERN)) {
    const resolved = resolveMaybeImagePath(match[2] ?? "", cwd);
    if (resolved) seen.add(`Image ${basename2(resolved)}`);
  }
  return [...seen].sort();
}
function mimeTypeForPath(path) {
  const lower = path.toLowerCase();
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
  if (lower.endsWith(".gif")) return "image/gif";
  if (lower.endsWith(".webp")) return "image/webp";
  if (lower.endsWith(".bmp")) return "image/bmp";
  if (lower.endsWith(".tif") || lower.endsWith(".tiff")) return "image/tiff";
  if (lower.endsWith(".heic")) return "image/heic";
  if (lower.endsWith(".heif")) return "image/heif";
  return "image/png";
}
var SUBMITTED_IMAGES_MAX_BYTES = 20 * 1024 * 1024;
async function imageContentsForPaths(paths, existing = []) {
  const files = [];
  let total = existing.reduce((sum, image) => sum + Buffer.byteLength(image.data, "base64"), 0);
  const checkSize = () => {
    if (total > SUBMITTED_IMAGES_MAX_BYTES) throw new Error(`IMAGE_SIZE_LIMIT: ${total} bytes exceeds ${SUBMITTED_IMAGES_MAX_BYTES}`);
  };
  try {
    checkSize();
    for (const path of paths) {
      const handle = await open(path, "r");
      const file = { path, handle, size: 0 };
      files.push(file);
      const stat = await handle.stat();
      if (!stat.isFile()) throw new Error(`IMAGE_NOT_FILE: ${path}`);
      file.size = stat.size;
      total += stat.size;
      checkSize();
    }
    const buffers = [];
    for (const file of files) {
      const buffer = Buffer.alloc(file.size + 1);
      let offset = 0;
      while (offset < buffer.length) {
        const { bytesRead } = await file.handle.read(buffer, offset, buffer.length - offset, offset);
        if (bytesRead === 0) break;
        offset += bytesRead;
      }
      if (offset > file.size) throw new Error(`IMAGE_SIZE_CHANGED: ${file.path}`);
      buffers.push(buffer.subarray(0, offset));
    }
    return files.map((file, index) => ({ type: "image", data: buffers[index].toString("base64"), mimeType: mimeTypeForPath(file.path) }));
  } finally {
    await Promise.all(files.map((file) => file.handle.close()));
  }
}
function attachmentLabels(text, cwd = process.cwd()) {
  const seen = /* @__PURE__ */ new Set();
  for (const match of text.matchAll(/\[Image\s+#(\d+)\]/gi)) {
    seen.add(`Image #${match[1]}`);
  }
  for (const label of imagePathLabels(text, cwd)) seen.add(label);
  return [...seen].sort((a, b) => Number(a.replace(/\D/g, "")) - Number(b.replace(/\D/g, "")) || a.localeCompare(b));
}
function chip(label, theme) {
  const text = ` ${label} `;
  if (theme) return theme.fg("accent", theme.inverse(text));
  return `[${label}]`;
}
function imageChipReplacements(visibleText, cwd, theme) {
  const replacements = [];
  for (const match of visibleText.matchAll(/\[Image\s+#(\d+)\]/gi)) {
    const start = match.index ?? 0;
    replacements.push({
      start,
      end: start + match[0].length,
      text: chip(`Image #${match[1]}`, theme)
    });
  }
  let imageIndex = 0;
  for (const match of visibleText.matchAll(IMAGE_PATH_PATTERN)) {
    const prefix = match[1] ?? "";
    const rawPath = match[2] ?? "";
    const resolved = resolveMaybeImagePath(rawPath, cwd);
    if (!resolved) continue;
    imageIndex += 1;
    const start = (match.index ?? 0) + prefix.length;
    replacements.push({
      start,
      end: start + rawPath.length,
      text: chip(`Image ${imageIndex}`, theme)
    });
  }
  return replacements;
}
function styleImageChips(line, cwd, theme) {
  if (!settingBoolean("showImageChips", true, cwd)) return line;
  const map = buildVisibleMap(line);
  const replacements = imageChipReplacements(map.text, cwd, theme);
  return replacements.length === 0 ? line : applyVisibleReplacements(line, map, replacements);
}
function statusText(ctx, text) {
  if (!settingBoolean("showAttachmentCountInStatus", true, ctx.cwd)) return void 0;
  const count = attachmentLabels(text, ctx.cwd).length;
  return count > 0 ? `images:${count}` : void 0;
}
function resolveSubmittedImagePaths(text, cwd) {
  const paths = /* @__PURE__ */ new Set();
  for (const match of text.matchAll(IMAGE_PATH_PATTERN)) {
    const resolved = resolveMaybeImagePath(match[2] ?? "", cwd);
    if (resolved) paths.add(resolved);
  }
  return [...paths];
}

// src/extensions/qol/editor.ts
function styleAutocompleteHintItem(item, theme) {
  const label = stripAnsi(item.label || item.value);
  const styled = { ...item, label: theme.fg("accent", label) };
  if (typeof item.description === "string" && item.description.length > 0) {
    styled.description = theme.fg("text", stripAnsi(item.description));
  }
  return styled;
}
function styleSlashAutocompleteHints(suggestions, theme) {
  if (!suggestions || !suggestions.prefix.startsWith("/")) return suggestions;
  return { ...suggestions, items: suggestions.items.map((item) => styleAutocompleteHintItem(item, theme)) };
}
function installAutocompleteHintStyling(ctx) {
  if (!ctx.hasUI) return;
  ctx.ui.addAutocompleteProvider((current) => ({
    ...current,
    async getSuggestions(lines, cursorLine, cursorCol, options) {
      return styleSlashAutocompleteHints(await current.getSuggestions(lines, cursorLine, cursorCol, options), ctx.ui.theme);
    },
    applyCompletion(lines, cursorLine, cursorCol, item, prefix) {
      return current.applyCompletion(lines, cursorLine, cursorCol, item, prefix);
    },
    shouldTriggerFileCompletion(lines, cursorLine, cursorCol) {
      return current.shouldTriggerFileCompletion?.(lines, cursorLine, cursorCol) ?? true;
    }
  }));
}
var QOL_ARGUMENT_COMPLETIONS = [
  { value: "status", label: "status", description: "Show QOL status and current settings" },
  { value: "rename", label: "rename", description: "Generate a session name from the first user message" },
  { value: "notify-test", label: "notify-test", description: "Send a test QOL notification" }
];
var QOL_RENAME_ARGUMENT_COMPLETIONS = [
  { value: "rename full", label: "rename full", description: "Generate a session name from the full conversation" }
];
function getQolArgumentCompletions(prefix) {
  const query = prefix.trimStart().toLowerCase();
  const items = query.startsWith("rename ") ? QOL_RENAME_ARGUMENT_COMPLETIONS : QOL_ARGUMENT_COMPLETIONS;
  const filtered = items.filter((item) => item.value.toLowerCase().startsWith(query));
  return filtered.length > 0 ? filtered : null;
}
var SESSION_SEARCH_ARGUMENT_COMPLETIONS = [
  { value: "refresh", label: "refresh", description: "Refresh the session search index" }
];
function getSessionSearchArgumentCompletions(prefix) {
  const query = prefix.trimStart().toLowerCase();
  const filtered = SESSION_SEARCH_ARGUMENT_COMPLETIONS.filter((item) => item.value.toLowerCase().startsWith(query) || (item.label ?? item.value).toLowerCase().startsWith(query));
  return filtered.length > 0 ? filtered : null;
}
function handleQolEditorInput(editor, ctx, data) {
  if (matchesKey(data, "alt+c")) {
    const caveman = readCavemanBridge();
    if (caveman?.cycleMode) {
      const next = caveman.cycleMode(ctx.cwd);
      if (typeof next === "string") {
        try {
          ctx.ui.notify(next === "off" ? "Caveman off." : `Caveman ${next} active.`, "info");
        } catch {
        }
      }
      return;
    }
  }
  const fallback = newlineFallbackKey(ctx.cwd);
  const newlineEnabled = settingBoolean("newlineOnShiftEnter", true, ctx.cwd);
  const isShiftEnter = matchesKey(data, "shift+enter") || matchesKey(data, "shift+return");
  const isFallback = fallback !== "none" && matchesKey(data, fallback);
  CustomEditor.prototype.handleInput.call(editor, newlineEnabled && (isShiftEnter || isFallback) ? "\n" : data);
}
function syncQolEditorStatus(ctx, text, cache) {
  const next = statusText(ctx, text);
  if (next === cache.last) return;
  cache.last = next;
  try {
    ctx.ui.setStatus(STATUS_KEY, next);
  } catch {
  }
}
var QolStatusEditor = class extends CustomEditor {
  statuslineIndicator;
  setWorkingStatusIndicator(indicator) {
    this.statuslineIndicator = indicator;
  }
  renderWorkingStatus(width) {
    const indicator = this.statuslineIndicator;
    if (!indicator || !this.embedWorkingStatus) return "";
    return indicator.kind === "working" ? indicator.renderSpinnerInBorder(width) : indicator.renderInBorder(width);
  }
};
var QolEditor = class extends QolStatusEditor {
  statusCache = {};
  ctx;
  constructor(tui, editorTheme, keybindings, ctx) {
    super(tui, editorTheme, keybindings, { embedWorkingStatus: settingBoolean("statusline.enabled", true, ctx.cwd) });
    this.ctx = ctx;
  }
  handleInput(data) {
    handleQolEditorInput(this, this.ctx, data);
  }
  render(width) {
    syncQolEditorStatus(this.ctx, this.getText(), this.statusCache);
    return super.render(width).map((line) => truncateToWidth2(styleImageChips(line, this.ctx.cwd, this.ctx.ui.theme), width, ""));
  }
};
function isEditorBorderLine(line) {
  const visible = stripAnsi(line).trim();
  return visible.length > 0 && /^[─━╭╮╰╯┌┐└┘]+$/.test(visible);
}
var QolCompactPromptEditor = class extends QolStatusEditor {
  statusCache = {};
  inputBottomPaddingLines;
  ctx;
  constructor(tui, editorTheme, keybindings, inputBottomPaddingLines, ctx) {
    super(tui, editorTheme, keybindings, { paddingX: 0, embedWorkingStatus: settingBoolean("statusline.enabled", true, ctx.cwd) });
    this.inputBottomPaddingLines = inputBottomPaddingLines;
    this.ctx = ctx;
  }
  handleInput(data) {
    handleQolEditorInput(this, this.ctx, data);
  }
  render(width) {
    syncQolEditorStatus(this.ctx, this.getText(), this.statusCache);
    const promptGlyph = glyphs(this.ctx.cwd).prompt;
    const prompt = this.borderColor(promptGlyph);
    const prefix = `${prompt} `;
    const prefixWidth = visibleWidth2(`${promptGlyph} `);
    const continuationPrefix = " ".repeat(prefixWidth);
    const innerWidth = Math.max(1, width - prefixWidth);
    const rendered = super.render(innerWidth);
    const inputLines = [];
    let completionLines = [];
    for (let index = 1; index < rendered.length; index++) {
      const line = rendered[index] ?? "";
      if (isEditorBorderLine(line)) {
        completionLines = rendered.slice(index + 1);
        break;
      }
      inputLines.push(line);
    }
    const lines = (inputLines.length > 0 ? inputLines : [""]).map((line, index) => {
      const linePrefix = index === 0 ? prefix : continuationPrefix;
      const content = styleImageChips(line, this.ctx.cwd, this.ctx.ui.theme);
      return truncateToWidth2(linePrefix + content, width, "");
    });
    for (let index = 0; index < this.inputBottomPaddingLines; index++) lines.push("");
    for (const line of completionLines) lines.push(truncateToWidth2(`${this.ctx.ui.theme.fg("dim", continuationPrefix)}${line}`, width, ""));
    return lines;
  }
};
function currentEditorText(ctx) {
  try {
    return ctx.ui.getEditorText?.() ?? "";
  } catch {
    return "";
  }
}

// src/extensions/qol/handoff.ts
import { BorderedLoader } from "@earendil-works/pi-coding-agent";
function errorMessage(error) {
  const message2 = error instanceof Error ? error.message : String(error);
  return message2.length > 180 ? `${message2.slice(0, 179)}\u2026` : message2;
}
async function runHandoff(args, ctx) {
  if (!ctx.hasUI) {
    ctx.ui.notify("handoff requires interactive mode", "error");
    return;
  }
  if (!ctx.model) {
    ctx.ui.notify("No model selected", "error");
    return;
  }
  const goal = args.trim();
  if (!goal) {
    ctx.ui.notify("Usage: /handoff <goal for new thread>", "error");
    return;
  }
  const built = ctx.sessionManager.buildSessionContext?.();
  const messages = Array.isArray(built?.messages) ? built.messages : [];
  if (messages.length === 0) {
    ctx.ui.notify("No conversation to hand off", "error");
    return;
  }
  const conversationText = serializeMessagesForSummary(messages);
  const currentSessionFile = ctx.sessionManager.getSessionFile();
  const releaseModalLock = acquirekendexModalLock();
  let result = null;
  let generationError;
  try {
    result = await ctx.ui.custom((tui, theme, _kb, done) => {
      const loader = new BorderedLoader(tui, theme, "Generating handoff prompt...");
      loader.onAbort = () => done(null);
      const doGenerate = async () => {
        const auth = await ctx.modelRegistry.getApiKeyAndHeaders(ctx.model);
        if (!auth.ok) throw new Error(auth.error);
        const userMessage = {
          role: "user",
          content: [
            {
              type: "text",
              text: `## Conversation History

${conversationText}

## User's Goal for New Thread

${goal}`
            }
          ],
          timestamp: Date.now()
        };
        const response = await complete(
          ctx.model,
          { systemPrompt: HANDOFF_SYSTEM_PROMPT, messages: [userMessage] },
          { apiKey: auth.apiKey, env: auth.env, headers: auth.headers, signal: loader.signal, onPayload: gatewayPrivacyOnPayload(ctx) }
        );
        if (response.stopReason === "aborted") return null;
        return response.content.filter((content) => content.type === "text").map((content) => content.text).join("\n");
      };
      doGenerate().then(done).catch((error) => {
        generationError = error;
        done(null);
      });
      return loader;
    });
  } finally {
    releaseModalLock();
  }
  if (result === null) {
    if (generationError) ctx.ui.notify(`Handoff generation failed: ${errorMessage(generationError)}`, "error");
    else ctx.ui.notify("Cancelled", "info");
    return;
  }
  const prompt = settingBoolean("handoffReviewPrompt", true, ctx.cwd) ? await ctx.ui.editor("Edit handoff prompt", result) : result;
  if (prompt === void 0) {
    ctx.ui.notify("Cancelled", "info");
    return;
  }
  const newSessionResult = await ctx.newSession({
    parentSession: currentSessionFile,
    withSession: async (replacementCtx) => {
      replacementCtx.ui.setEditorText(prompt);
      replacementCtx.ui.notify("Handoff ready. Submit when ready.", "info");
    }
  });
  if (newSessionResult.cancelled) {
    ctx.ui.notify("New session cancelled", "info");
  }
}

// src/extensions/qol/notifications.ts
import { execFile } from "node:child_process";
import { constants } from "node:fs";
import { open as open2 } from "node:fs/promises";
var lastNotificationAt = /* @__PURE__ */ new Map();
var lastQuestionNotificationAt = /* @__PURE__ */ new Map();
var tmuxMarkedTarget;
var tmuxOriginalWindowName;
var tmuxWindowMarkTimer;
function sanitizeNotificationPart(input, maxChars = DEFAULT_NOTIFICATION_BODY_MAX_CHARS) {
  const cleaned = input.replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g, " ").replace(/\s+/g, " ").trim();
  return cleaned.length > maxChars ? `${cleaned.slice(0, Math.max(0, maxChars - 1))}\u2026` : cleaned;
}
function windowsToastScript(title, body) {
  const escapedTitle = title.replace(/'/g, "''");
  const escapedBody = body.replace(/'/g, "''");
  const type = "Windows.UI.Notifications";
  const mgr = `[${type}.ToastNotificationManager, ${type}, ContentType = WindowsRuntime]`;
  const template = `[${type}.ToastTemplateType]::ToastText02`;
  const toast = `[${type}.ToastNotification]::new($xml)`;
  return [
    `${mgr} > $null`,
    `$xml = [${type}.ToastNotificationManager]::GetTemplateContent(${template})`,
    `$xml.GetElementsByTagName('text')[0].AppendChild($xml.CreateTextNode('${escapedTitle}')) > $null`,
    `$xml.GetElementsByTagName('text')[1].AppendChild($xml.CreateTextNode('${escapedBody}')) > $null`,
    `[${type}.ToastNotificationManager]::CreateToastNotifier('${escapedTitle}').Show(${toast})`
  ].join("; ");
}
function tmuxPassthrough(sequence) {
  return `\x1BPtmux;${sequence.replace(/\x1b/g, "\x1B\x1B")}\x1B\\`;
}
function terminalBellSequence(muteBellSound) {
  return muteBellSound ? void 0 : "\x07";
}
function osc777NotificationSequence(title, body, muteBellSound = false) {
  const terminator = muteBellSound ? "\x1B\\" : "\x07";
  return `\x1B]777;notify;${title};${body}${terminator}`;
}
function notificationBellMuted(cwd) {
  return settingBoolean("notification.muteBellSound", false, cwd);
}
var PANE_STATE_FORMAT = "#{pane_tty}	#{window_active}	#{session_id}	#{window_id}	#W";
var terminalWrites = Promise.resolve();
var tmuxMarkGeneration = 0;
async function tmux(pi, args) {
  try {
    const result = await pi.exec("tmux", args, { timeout: TMUX_COMMAND_TIMEOUT_MS });
    if (result.killed || result.code !== 0) return void 0;
    return result.stdout;
  } catch {
    return void 0;
  }
}
async function sourceTmuxPaneState(pi) {
  const pane = process.env.TMUX_PANE;
  if (!pane) return void 0;
  const stdout = await tmux(pi, ["display-message", "-p", "-t", pane, PANE_STATE_FORMAT]);
  const [paneTty = "", windowActive = "", sessionId = "", windowId = "", ...name] = (stdout ?? "").replace(/\r?\n$/, "").split("	");
  if (!paneTty || !sessionId || !windowId) return void 0;
  return { paneTty, windowActive: windowActive === "1", sessionId, windowId, windowName: name.join("	") };
}
async function tmuxClientTtys(pi, pane) {
  if (!process.env.TMUX) return [];
  const args = ["list-clients", "-F", "#{client_tty}"];
  if (pane) args.splice(1, 0, "-t", pane.sessionId);
  const output = await tmux(pi, args);
  if (output === void 0) return [];
  return [...new Set(output.split(/\r?\n/).map((line) => line.trim()).filter(Boolean))];
}
function queueTerminalWrite(write) {
  const queued = terminalWrites.then(write);
  terminalWrites = queued.catch(() => void 0);
  return queued;
}
async function writeTty(path, output) {
  const handle = await open2(path, constants.O_WRONLY | constants.O_NONBLOCK | constants.O_NOCTTY);
  try {
    await handle.writeFile(output, "utf8");
  } finally {
    await handle.close();
  }
}
async function writeRawToPaths(paths, output) {
  let wrote = false;
  for (const path of paths) {
    try {
      await writeTty(path, output);
      wrote = true;
    } catch {
    }
  }
  return wrote;
}
async function writeToTerminal(pane, output) {
  try {
    await writeTty(pane?.paneTty ?? "/dev/tty", output);
    return;
  } catch {
  }
  try {
    if (process.stdout.isTTY) process.stdout.write(output);
  } catch {
  }
}
async function writeTerminalSequence(pi, pane, sequence, cwd) {
  const clientTtys = process.env.TMUX && settingBoolean("notification.tmuxNativeClientTty", true, cwd) ? await tmuxClientTtys(pi, pane) : [];
  const output = process.env.TMUX && settingBoolean("notification.tmuxPassthrough", true, cwd) ? tmuxPassthrough(sequence) : sequence;
  await queueTerminalWrite(async () => {
    if (await writeRawToPaths(clientTtys, sequence)) return;
    await writeToTerminal(pane, output);
  });
}
function writeTerminalBell(pane, cwd) {
  const sequence = terminalBellSequence(notificationBellMuted(cwd));
  if (!sequence) return Promise.resolve();
  return queueTerminalWrite(() => writeToTerminal(pane, sequence));
}
function notifyOSC777(pi, pane, title, body, cwd) {
  return writeTerminalSequence(pi, pane, osc777NotificationSequence(title, body, notificationBellMuted(cwd)), cwd);
}
async function notifyOSC99(pi, pane, title, body, cwd) {
  await writeTerminalSequence(pi, pane, `\x1B]99;i=1:d=0;${title}\x1B\\`, cwd);
  await writeTerminalSequence(pi, pane, `\x1B]99;i=1:p=body;${body}\x1B\\`, cwd);
}
function notifyWindows(title, body) {
  execFile("powershell.exe", ["-NoProfile", "-Command", windowsToastScript(title, body)], () => void 0);
}
async function notifyNativeTerminal(pi, pane, title, body, cwd) {
  const protocol = settingString("notification.oscProtocol", "auto", cwd);
  if (process.env.WT_SESSION) {
    notifyWindows(title, body);
    return;
  }
  if (protocol === "off") return;
  if (protocol === "osc99" || protocol === "auto" && process.env.KITTY_WINDOW_ID) {
    await notifyOSC99(pi, pane, title, body, cwd);
    return;
  }
  await notifyOSC777(pi, pane, title, body, cwd);
}
function notifyTmux(pi, title, body, cwd) {
  if (!process.env.TMUX && !process.env.TMUX_PANE) return;
  const duration = Math.max(500, Math.floor(settingNumber("notification.tmuxMessageDurationMs", DEFAULT_TMUX_MESSAGE_DURATION_MS, cwd)));
  const message2 = `${title}: ${body}`;
  const args = ["display-message", "-d", String(duration)];
  if (process.env.TMUX_PANE) args.push("-t", process.env.TMUX_PANE);
  args.push(message2);
  void tmux(pi, args);
}
function unmarkTmuxWindow(pi) {
  const target = tmuxMarkedTarget;
  const original = tmuxOriginalWindowName;
  tmuxMarkedTarget = void 0;
  tmuxOriginalWindowName = void 0;
  if (!target || !original) return;
  void tmux(pi, ["rename-window", "-t", target, original]);
}
function clearTmuxWindowMark(pi) {
  tmuxMarkGeneration += 1;
  if (tmuxWindowMarkTimer) clearTimeout(tmuxWindowMarkTimer);
  tmuxWindowMarkTimer = void 0;
  unmarkTmuxWindow(pi);
}
function markTmuxWindow(pi, pane, generation, cwd) {
  if (!settingBoolean("notification.tmuxWindowMark", false, cwd)) return;
  if (!process.env.TMUX || !pane || generation !== tmuxMarkGeneration) return;
  const mark = sanitizeNotificationPart(settingString("notification.tmuxWindowMarkText", "!", cwd), 12) || "!";
  const prefix = `${mark} `;
  const target = pane.windowId;
  const current = pane.windowName;
  if (!current) return;
  if (tmuxMarkedTarget && tmuxMarkedTarget !== target) unmarkTmuxWindow(pi);
  if (!tmuxMarkedTarget) {
    tmuxMarkedTarget = target;
    tmuxOriginalWindowName = current.startsWith(prefix) ? current.slice(prefix.length) : current;
  }
  if (!current.startsWith(prefix)) void tmux(pi, ["rename-window", "-t", target, `${prefix}${current}`]);
  const duration = Math.max(0, Math.floor(settingNumber("notification.tmuxWindowMarkDurationMs", 0, cwd)));
  if (tmuxWindowMarkTimer) clearTimeout(tmuxWindowMarkTimer);
  if (duration > 0) {
    tmuxWindowMarkTimer = setTimeout(() => clearTmuxWindowMark(pi), duration);
    tmuxWindowMarkTimer.unref?.();
  }
}
function notificationEnabledFor(kind, cwd) {
  if (!settingBoolean("notification.enabled", true, cwd)) return false;
  switch (kind) {
    case "ready":
      return settingBoolean("notification.onAgentReady", true, cwd);
    case "direction":
      return settingBoolean("notification.onDirectionNeeded", true, cwd);
    case "question":
      return settingBoolean("notification.onQuestion", true, cwd);
    case "task-complete":
      return settingBoolean("notification.onTaskComplete", true, cwd);
    case "critical":
      return settingBoolean("notification.onCritical", true, cwd);
    case "test":
      return true;
  }
}
function resetQolNotificationCooldowns() {
  lastNotificationAt.clear();
  lastQuestionNotificationAt.clear();
}
async function deliverTerminalNotification(pi, title, text, markGeneration, cwd) {
  const pane = await sourceTmuxPaneState(pi);
  const windowActive = pane?.windowActive ?? false;
  if (!windowActive) markTmuxWindow(pi, pane, markGeneration, cwd);
  if (settingBoolean("notification.tmux", false, cwd)) notifyTmux(pi, title, text, cwd);
  if (settingBoolean("notification.bell", true, cwd) && (!windowActive || settingBoolean("notification.bellWhenActive", false, cwd))) await writeTerminalBell(pane, cwd);
  if (settingBoolean("notification.native", true, cwd)) await notifyNativeTerminal(pi, pane, title, text, cwd);
}
function sendQolNotification(pi, ctx, kind, body, level = "info", key = kind) {
  const cwd = ctx?.cwd;
  if (ctx && !ctx.hasUI) return Promise.resolve();
  if (!notificationEnabledFor(kind, cwd)) return Promise.resolve();
  const cooldownMs = Math.max(0, settingNumber("notification.cooldownSeconds", DEFAULT_NOTIFICATION_COOLDOWN_SECONDS, cwd) * 1e3);
  const now = Date.now();
  const last = lastNotificationAt.get(key) ?? 0;
  if (cooldownMs > 0 && now - last < cooldownMs) return Promise.resolve();
  for (const [storedKey, sentAt] of lastNotificationAt) {
    if (now - sentAt >= cooldownMs) lastNotificationAt.delete(storedKey);
  }
  if (cooldownMs > 0) lastNotificationAt.set(key, now);
  const title = sanitizeNotificationPart(settingString("notification.title", DEFAULT_NOTIFICATION_TITLE, cwd), 80) || DEFAULT_NOTIFICATION_TITLE;
  const text = sanitizeNotificationPart(body, Math.max(40, Math.floor(settingNumber("notification.bodyMaxChars", DEFAULT_NOTIFICATION_BODY_MAX_CHARS, cwd))));
  if (ctx?.hasUI && settingBoolean("notification.piUi", false, cwd)) ctx.ui.notify(text, level);
  return deliverTerminalNotification(pi, title, text, tmuxMarkGeneration, cwd).catch(() => void 0);
}
function questionNotificationTitle(request) {
  if (typeof request?.header === "string" && request.header.trim()) return request.header.trim();
  if (typeof request?.question === "string" && request.question.trim()) return request.question.trim();
  return "Question";
}
function notifyQuestionOpened(pi, ctx, event, keyPrefix = "question") {
  const title = questionNotificationTitle(event.request);
  const key = `${keyPrefix}:${event.requestId ?? title}`;
  const now = Date.now();
  const last = lastQuestionNotificationAt.get(key) ?? 0;
  if (now - last < QUESTION_NOTIFY_DEDUP_MS) return;
  lastQuestionNotificationAt.set(key, now);
  for (const [storedKey, timestamp] of lastQuestionNotificationAt) {
    if (now - timestamp > 6e4) lastQuestionNotificationAt.delete(storedKey);
  }
  void sendQolNotification(pi, ctx, "question", `Input required: ${title}`, "warning", key);
}

// src/extensions/qol/pending-queue.ts
import { Theme as Theme2 } from "@earendil-works/pi-coding-agent";
import { Text } from "@earendil-works/pi-tui";
function isStatusTextAlignmentPatch(value) {
  return typeof value === "object" && value !== null && typeof value.originalRender === "function";
}
function isPendingQueuePreviewText(text) {
  const plain = stripAnsi(text);
  return plain.startsWith("Steering: ") || plain.startsWith("Follow-up: ");
}
function isPendingQueueHintText(text) {
  const plain = stripAnsi(text);
  return plain.startsWith("\u21B3 ") && plain.includes("queued messages");
}
function pendingQueuePreviewLine(text) {
  return ansiGreen(`\u2503 ${text}`);
}
function isQueuedMessageStatusText(text) {
  const plain = stripAnsi(text);
  return /^Restored \d+ queued messages? to editor$/.test(plain) || plain === "No queued messages to restore";
}
function installStatusTextAlignmentPatch(ctx) {
  if (!ctx.hasUI) return;
  const proto = Text.prototype;
  if (proto[STATUS_TEXT_ALIGNMENT_PATCH_SYMBOL] !== void 0) return;
  const originalRender = proto.render;
  if (typeof originalRender !== "function") return;
  const classifications = /* @__PURE__ */ new WeakMap();
  const isStatusText = (component, text) => {
    const cached = classifications.get(component);
    if (cached && cached.text === text) return cached.status;
    const status = isQueuedMessageStatusText(text);
    classifications.set(component, { text, status });
    return status;
  };
  const patch = { originalRender };
  proto[STATUS_TEXT_ALIGNMENT_PATCH_SYMBOL] = patch;
  proto.render = function patchedQolStatusTextRender(width) {
    const text = typeof this?.text === "string" ? this.text : "";
    if (!isStatusText(this, text)) return originalRender.call(this, width);
    const originalPaddingX = this.paddingX;
    try {
      this.paddingX = 0;
      this.invalidate?.();
      return originalRender.call(this, width);
    } finally {
      this.paddingX = originalPaddingX;
      this.invalidate?.();
    }
  };
}
function restoreStatusTextAlignmentPatch() {
  const proto = Text.prototype;
  const patch = proto[STATUS_TEXT_ALIGNMENT_PATCH_SYMBOL];
  if (!isStatusTextAlignmentPatch(patch)) return;
  proto.render = patch.originalRender;
  delete proto[STATUS_TEXT_ALIGNMENT_PATCH_SYMBOL];
}
function installPendingQueueThemePatch(ctx) {
  if (!ctx.hasUI) return;
  const proto = Theme2.prototype;
  const existing = proto[PENDING_QUEUE_THEME_PATCH_SYMBOL];
  if (existing) {
    existing.cwd = ctx.cwd;
    return;
  }
  const originalFg = proto.fg;
  if (typeof originalFg !== "function") return;
  const patch = { originalFg, cwd: ctx.cwd };
  proto[PENDING_QUEUE_THEME_PATCH_SYMBOL] = patch;
  proto.fg = function patchedQolFg(token, text) {
    if (token === "dim" && typeof text === "string" && settingBoolean("pendingQueue.asciiGreen", true, patch.cwd)) {
      if (isPendingQueuePreviewText(text)) return pendingQueuePreviewLine(text);
      if (isPendingQueueHintText(text)) return patch.originalFg.call(this, token, `  ${text}`);
    }
    return patch.originalFg.call(this, token, text);
  };
}
function restorePendingQueueThemePatch(_ctx) {
  const proto = Theme2.prototype;
  const patch = proto[PENDING_QUEUE_THEME_PATCH_SYMBOL];
  if (!patch) return;
  proto.fg = patch.originalFg;
  delete proto[PENDING_QUEUE_THEME_PATCH_SYMBOL];
}

// src/extensions/qol/permission-gate.ts
import { truncateToWidth as truncateToWidth3, visibleWidth as visibleWidth3 } from "@earendil-works/pi-tui";
function splitPermissionGateCommands(raw) {
  return raw.split(",").map((entry) => entry.trim()).filter(Boolean);
}
function regexFromSlashPattern(entry) {
  if (!entry.startsWith("/")) return void 0;
  const end = entry.lastIndexOf("/");
  if (end <= 0) return void 0;
  const source = entry.slice(1, end);
  const flags = entry.slice(end + 1);
  try {
    return new RegExp(source, flags || "i");
  } catch {
    return void 0;
  }
}
function literalCommandPattern(entry) {
  const source = entry.split(/\s+/).map(escapeRegex).join("\\s+");
  if (!source) return void 0;
  try {
    return new RegExp(source, "i");
  } catch {
    return void 0;
  }
}
function permissionGateCommands(cwd) {
  return splitPermissionGateCommands(settingStringAllowEmpty("permissionGate.commands", DEFAULT_PERMISSION_GATE_COMMANDS, cwd));
}
function permissionGateMatchers(cwd) {
  return permissionGateCommands(cwd).map((entry) => ({ label: entry, pattern: regexFromSlashPattern(entry) ?? literalCommandPattern(entry) })).filter((matcher) => matcher.pattern instanceof RegExp);
}
function permissionGateMatch(command, cwd) {
  for (const matcher of permissionGateMatchers(cwd)) {
    matcher.pattern.lastIndex = 0;
    if (matcher.pattern.test(command)) return matcher.label;
  }
  return void 0;
}
function formatCount(count, label) {
  return `${count.toLocaleString()} ${label}${count === 1 ? "" : "s"}`;
}
function sanitizePermissionGatePreview(command) {
  return stripAnsi(command).replace(/\r\n/g, "\n").replace(/\r/g, "\n").replace(/\t/g, "    ").replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g, "\uFFFD");
}
function permissionGateCommandPreview(command, cwd) {
  const maxLines = boundedSettingNumber("permissionGate.previewLines", DEFAULT_PERMISSION_GATE_PREVIEW_LINES, 4, 40, cwd);
  const maxChars = boundedSettingNumber("permissionGate.previewChars", DEFAULT_PERMISSION_GATE_PREVIEW_CHARS, 200, 5e3, cwd);
  const maxLineWidth = boundedSettingNumber("permissionGate.previewLineWidth", DEFAULT_PERMISSION_GATE_PREVIEW_LINE_WIDTH, 40, 240, cwd);
  const safeCommand = sanitizePermissionGatePreview(command);
  const commandLines = safeCommand.split("\n");
  let selectedLines = commandLines;
  let omittedLines = 0;
  if (commandLines.length > maxLines) {
    const headCount = Math.max(1, Math.ceil((maxLines - 1) * 0.65));
    const tailCount = Math.max(1, maxLines - headCount - 1);
    omittedLines = Math.max(0, commandLines.length - headCount - tailCount);
    selectedLines = [
      ...commandLines.slice(0, headCount),
      `\u2026 ${formatCount(omittedLines, "line")} omitted \u2026`,
      ...commandLines.slice(-tailCount)
    ];
  }
  let widthTruncated = false;
  const previewLines = selectedLines.map((line) => {
    if (/^… \d[\d,]* lines? omitted …$/.test(line)) return line;
    if (visibleWidth3(line) > maxLineWidth) widthTruncated = true;
    return truncateToWidth3(line, maxLineWidth, "\u2026");
  });
  let text = previewLines.join("\n").trimEnd();
  let charTruncated = false;
  if (text.length > maxChars) {
    const marker = `
\u2026 preview clipped to ${formatCount(maxChars, "char")} \u2026
`;
    const budget = Math.max(0, maxChars - marker.length);
    const headChars = Math.ceil(budget * 0.6);
    const tailChars = Math.max(0, budget - headChars);
    const tail = tailChars > 0 ? text.slice(-tailChars).trimStart() : "";
    text = `${text.slice(0, headChars).trimEnd()}${marker}${tail}`;
    charTruncated = true;
  }
  return {
    text: text || "(empty command)",
    totalChars: command.length,
    totalLines: commandLines.length,
    truncated: omittedLines > 0 || widthTruncated || charTruncated
  };
}
function permissionGatePrompt(matched, command, cwd) {
  const preview = permissionGateCommandPreview(command, cwd);
  const matchedLabel = truncateToWidth3(sanitizePermissionGatePreview(matched).replace(/\n+/g, " ").trim() || "configured pattern", DEFAULT_PERMISSION_GATE_PREVIEW_LINE_WIDTH, "\u2026");
  const commandStats = `${formatCount(preview.totalLines, "line")}, ${formatCount(preview.totalChars, "char")}`;
  return [
    `Permission gate matched: ${matchedLabel}`,
    "",
    `Bash command (${commandStats}${preview.truncated ? "; compact preview" : ""}):`,
    "```sh",
    preview.text,
    "```",
    ...preview.truncated ? ["Full command is unchanged; only this approval preview was shortened."] : [],
    "",
    "Allow this bash command?"
  ].join("\n");
}

// src/extensions/qol/rate-limit-auto-resume.ts
import { truncateToWidth as truncateToWidth4 } from "@earendil-works/pi-tui";
var RATE_LIMIT_AUTO_RESUME_EVENT = "kendex:rate-limit";
var DEFAULT_RATE_LIMIT_RESUME_MESSAGE = "Hit API rate limit. It has been reset. Continue";
var MAX_TIMER_DELAY_MS = 2147e6;
var DEFAULT_BUFFER_SECONDS = 10;
var DEFAULT_MAX_DELAY_MINUTES = 24 * 60;
var RATE_LIMIT_TOKEN = "[rate-limit]";
var DEFAULT_CLOCK = {
  now: () => Date.now(),
  setTimeout: (callback, delayMs) => setTimeout(callback, delayMs),
  clearTimeout: (timer) => clearTimeout(timer)
};
function asRecord(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : void 0;
}
function stringValue(value) {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : void 0;
}
function numberValue(value) {
  const parsed = typeof value === "number" ? value : typeof value === "string" && value.trim() ? Number(value) : Number.NaN;
  return Number.isFinite(parsed) ? parsed : void 0;
}
function allHeaderValues(headers, key) {
  const wanted = key.toLowerCase();
  if (!headers || typeof headers !== "object") return [];
  const anyHeaders = headers;
  try {
    if (typeof anyHeaders.get === "function") {
      const value = anyHeaders.get(key) ?? anyHeaders.get(wanted);
      if (typeof value === "string" && value.trim()) return [value.trim()];
    }
  } catch {
  }
  const out = [];
  for (const [rawKey, rawValue] of Object.entries(headers)) {
    if (rawKey.toLowerCase() !== wanted) continue;
    if (Array.isArray(rawValue)) {
      for (const item of rawValue) if (typeof item === "string" && item.trim()) out.push(item.trim());
    } else if (typeof rawValue === "string" && rawValue.trim()) out.push(rawValue.trim());
    else if (typeof rawValue === "number" && Number.isFinite(rawValue)) out.push(String(rawValue));
  }
  return out;
}
function looksLikeRateLimitText(text) {
  return /\b(rate[-\s]?limit(?:ed)?|too many requests|\b429\b|quota exceeded|resource exhausted|try again later|retry[-\s]?after|out of extra usage|extra usage)\b/i.test(text);
}
function parseUnitDurationMs(amount, unit, defaultUnit = "s") {
  if (!Number.isFinite(amount) || amount < 0) return void 0;
  const normalized = (unit ?? defaultUnit).toLowerCase();
  const multiplier = ["ms", "msec", "msecs", "millisecond", "milliseconds"].includes(normalized) ? 1 : ["s", "sec", "secs", "second", "seconds"].includes(normalized) ? 1e3 : ["m", "min", "mins", "minute", "minutes"].includes(normalized) ? 60 * 1e3 : ["h", "hr", "hrs", "hour", "hours"].includes(normalized) ? 60 * 60 * 1e3 : ["d", "day", "days"].includes(normalized) ? 24 * 60 * 60 * 1e3 : void 0;
  if (!multiplier) return void 0;
  const delay = Math.round(amount * multiplier);
  return Number.isFinite(delay) ? delay : void 0;
}
function parseDurationLikeMs(value, defaultUnit = "s") {
  const text = value.trim().toLowerCase();
  if (!text) return void 0;
  if (/^\d+(?:\.\d+)?$/.test(text)) return parseUnitDurationMs(Number(text), void 0, defaultUnit);
  const single = text.match(/^(\d+(?:\.\d+)?)\s*(ms|msec|msecs|milliseconds?|s|sec|secs|seconds?|m|min|mins|minutes?|h|hr|hrs|hours?|d|days?)$/i);
  if (single) return parseUnitDurationMs(Number(single[1]), single[2], defaultUnit);
  let total = 0;
  let matched = false;
  const re = /(\d+(?:\.\d+)?)\s*(ms|msec|msecs|milliseconds?|s|sec|secs|seconds?|m|min|mins|minutes?|h|hr|hrs|hours?|d|days?)/gi;
  for (const match of text.matchAll(re)) {
    const part = parseUnitDurationMs(Number(match[1]), match[2], defaultUnit);
    if (part === void 0) return void 0;
    total += part;
    matched = true;
  }
  return matched && Number.isFinite(total) ? Math.round(total) : void 0;
}
function parseRetryAfterMs(value, now = Date.now(), defaultUnit = "s") {
  const duration = parseDurationLikeMs(value, defaultUnit);
  if (duration !== void 0) return now + duration;
  const parsedDate = Date.parse(value);
  return Number.isFinite(parsedDate) ? parsedDate : void 0;
}
function parseResetValueMs(value, now = Date.now()) {
  const trimmed = value.trim();
  if (!trimmed) return void 0;
  const numeric = Number(trimmed);
  if (Number.isFinite(numeric)) {
    if (numeric > 1e12) return numeric;
    if (numeric > 1e9) return numeric * 1e3;
    return now + numeric * 1e3;
  }
  const parsedDate = Date.parse(trimmed);
  if (Number.isFinite(parsedDate)) return parsedDate;
  const duration = parseDurationLikeMs(trimmed, "s");
  return duration !== void 0 ? now + duration : void 0;
}
function extractResetAtFromHeaders(headers, now = Date.now()) {
  for (const value of allHeaderValues(headers, "retry-after-ms")) {
    const resetAt = parseRetryAfterMs(value, now, "ms");
    if (resetAt !== void 0) return { resetAt, source: "retry-after-ms" };
  }
  for (const value of allHeaderValues(headers, "retry-after")) {
    const resetAt = parseRetryAfterMs(value, now, "s");
    if (resetAt !== void 0) return { resetAt, source: "retry-after" };
  }
  const resetHeaders = [
    "x-ratelimit-reset",
    "x-rate-limit-reset",
    "ratelimit-reset",
    "x-ratelimit-reset-requests",
    "x-ratelimit-reset-tokens",
    "anthropic-ratelimit-requests-reset",
    "anthropic-ratelimit-tokens-reset",
    "anthropic-ratelimit-input-tokens-reset",
    "anthropic-ratelimit-output-tokens-reset"
  ];
  for (const header of resetHeaders) {
    for (const value of allHeaderValues(headers, header)) {
      const resetAt = parseResetValueMs(value, now);
      if (resetAt !== void 0) return { resetAt, source: header };
    }
  }
  return void 0;
}
function parseClockReset(text, now = Date.now()) {
  const match = text.match(/\bresets?(?:\s+at)?\s+(\d{1,2})(?::(\d{2}))?(?::(\d{2}))?\s*(am|pm)?\b/i);
  if (!match) return void 0;
  let hour = Number(match[1]);
  const minute = Number(match[2] ?? "0");
  const second = Number(match[3] ?? "0");
  const meridiem = match[4]?.toLowerCase();
  if (!Number.isInteger(hour) || !Number.isInteger(minute) || !Number.isInteger(second)) return void 0;
  if (minute > 59 || second > 59) return void 0;
  if (meridiem) {
    if (hour < 1 || hour > 12) return void 0;
    if (meridiem === "pm" && hour !== 12) hour += 12;
    if (meridiem === "am" && hour === 12) hour = 0;
  } else if (hour > 23) return void 0;
  const date = new Date(now);
  date.setHours(hour, minute, second, 0);
  if (date.getTime() <= now) date.setDate(date.getDate() + 1);
  return date.getTime();
}
function extractResetAtFromText(text, now = Date.now()) {
  const iso = text.match(/\b\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})\b/);
  if (iso) {
    const resetAt = Date.parse(iso[0]);
    if (Number.isFinite(resetAt)) return { resetAt, source: "text-iso" };
  }
  const durationMatch = text.match(/\b(?:retry(?:\s+after|\s+in)?|try again in|wait)\s+(\d+(?:\.\d+)?\s*(?:ms|msec|msecs|milliseconds?|s|sec|secs|seconds?|m|min|mins|minutes?|h|hr|hrs|hours?|d|days?)(?:\s*\d+(?:\.\d+)?\s*(?:ms|msec|msecs|milliseconds?|s|sec|secs|seconds?|m|min|mins|minutes?|h|hr|hrs|hours?|d|days?))*)\b/i);
  if (durationMatch) {
    const duration = parseDurationLikeMs(durationMatch[1], "s");
    if (duration !== void 0) return { resetAt: now + duration, source: "text-duration" };
  }
  const clock = parseClockReset(text, now);
  return clock !== void 0 ? { resetAt: clock, source: "text-clock" } : void 0;
}
function messageText(message2) {
  const parts = [];
  if (typeof message2?.errorMessage === "string") parts.push(message2.errorMessage);
  if (typeof message2?.content === "string") parts.push(message2.content);
  else if (Array.isArray(message2?.content)) {
    for (const block of message2.content) {
      if (typeof block === "string") parts.push(block);
      else if (block?.type === "text" && typeof block.text === "string") parts.push(block.text);
    }
  }
  return parts.filter(Boolean).join("\n");
}
function lastAssistantMessage(event, ctx) {
  const eventMessages = Array.isArray(event?.messages) ? event.messages : [];
  for (let index = eventMessages.length - 1; index >= 0; index -= 1) {
    const message2 = eventMessages[index];
    if (message2?.role === "assistant") return message2;
  }
  const branch = ctx.sessionManager.getBranch?.() ?? [];
  for (let index = branch.length - 1; index >= 0; index -= 1) {
    const entry = branch[index];
    if (entry?.type === "message" && entry.message?.role === "assistant") return entry.message;
  }
  return void 0;
}
function formatDueTime(timestamp) {
  return new Date(timestamp).toLocaleString(void 0, {
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    month: "short",
    timeZoneName: "short"
  });
}
function previewMessage(message2, max = 72) {
  const singleLine = message2.replace(/\s+/g, " ").trim();
  return singleLine.length <= max ? singleLine : `${singleLine.slice(0, Math.max(0, max - 1))}\u2026`;
}
function settingsEnabled(ctx) {
  return settingBoolean("rateLimitAutoResume.enabled", false, ctx.cwd);
}
function settingsNotify(ctx) {
  return settingBoolean("rateLimitAutoResume.notify", true, ctx.cwd);
}
function settingsMessage(ctx) {
  return settingString("rateLimitAutoResume.message", DEFAULT_RATE_LIMIT_RESUME_MESSAGE, ctx.cwd);
}
function settingsBufferMs(ctx) {
  return boundedSettingNumber("rateLimitAutoResume.bufferSeconds", DEFAULT_BUFFER_SECONDS, 0, 600, ctx.cwd) * 1e3;
}
function settingsMaxDelayMs(ctx) {
  return boundedSettingNumber("rateLimitAutoResume.maxDelayMinutes", DEFAULT_MAX_DELAY_MINUTES, 1, 30 * 24 * 60, ctx.cwd) * 60 * 1e3;
}
function createRateLimitAutoResumeController(pi, clock = DEFAULT_CLOCK) {
  let onChange;
  let turnId = 0;
  let latestHint;
  let pending;
  const notifyChanged = () => {
    try {
      onChange?.();
    } catch {
    }
  };
  const clearPendingTimer = () => {
    if (!pending?.timer) return;
    clock.clearTimeout(pending.timer);
    pending.timer = void 0;
  };
  const clearPending = () => {
    const hadPending = Boolean(pending);
    clearPendingTimer();
    pending = void 0;
    if (hadPending) notifyChanged();
  };
  const noteHint = (hint) => {
    if (hint.resetAt !== void 0 && (!Number.isFinite(hint.resetAt) || hint.resetAt <= 0)) return;
    latestHint = {
      ...hint,
      observedAt: hint.observedAt ?? clock.now(),
      turnId: hint.turnId ?? turnId
    };
  };
  const deliverPending = async (snapshot, ctx) => {
    if (pending !== snapshot) return;
    if (snapshot.turnId !== turnId || !settingsEnabled(ctx)) {
      clearPending();
      return;
    }
    if (clock.now() < snapshot.dueAt) {
      armPending(snapshot, ctx);
      return;
    }
    clearPending();
    try {
      let idle = true;
      try {
        idle = ctx.isIdle?.() ?? true;
      } catch {
        idle = false;
      }
      await Promise.resolve(idle ? pi.sendUserMessage(snapshot.message) : pi.sendUserMessage(snapshot.message, { deliverAs: "followUp" }));
      if (ctx.hasUI && settingsNotify(ctx)) ctx.ui.notify(`${RATE_LIMIT_TOKEN} Auto-resume sent after rate-limit reset.`, "info");
    } catch (error) {
      if (ctx.hasUI) ctx.ui.notify(`${RATE_LIMIT_TOKEN} Auto-resume failed: ${stringifyError(error)}`, "error");
    }
  };
  function armPending(snapshot, ctx) {
    clearPendingTimer();
    const remaining = Math.max(0, snapshot.dueAt - clock.now());
    snapshot.timer = clock.setTimeout(() => {
      void deliverPending(snapshot, ctx);
    }, Math.min(remaining, MAX_TIMER_DELAY_MS));
    snapshot.timer.unref?.();
  }
  const scheduleFromHint = (hint, ctx) => {
    if (!settingsEnabled(ctx)) return false;
    if (hint.turnId !== turnId) return false;
    if (ctx.hasPendingMessages?.()) return false;
    if (hint.resetAt === void 0 || !Number.isFinite(hint.resetAt)) return false;
    const dueAt = Math.max(clock.now() + 1e3, hint.resetAt + settingsBufferMs(ctx));
    const delay = dueAt - clock.now();
    if (delay > settingsMaxDelayMs(ctx)) return false;
    const message2 = settingsMessage(ctx);
    clearPendingTimer();
    pending = { dueAt, message: message2, reason: hint.reason, resetAt: hint.resetAt, source: hint.source, turnId };
    armPending(pending, ctx);
    notifyChanged();
    if (ctx.hasUI && settingsNotify(ctx)) {
      ctx.ui.notify(`${RATE_LIMIT_TOKEN} Rate limit hit. Auto-resume scheduled for ${formatDueTime(dueAt)}.`, "warning");
    }
    return true;
  };
  return {
    enabled(ctx) {
      return settingsEnabled(ctx);
    },
    clearTimers() {
      clearPending();
    },
    noteAgentStart(_ctx) {
      turnId += 1;
      latestHint = void 0;
      clearPending();
    },
    noteAgentEnd(event, ctx) {
      const assistant = lastAssistantMessage(event, ctx);
      const text = messageText(assistant);
      const textShowsRateLimit = Boolean(text && looksLikeRateLimitText(text));
      if (textShowsRateLimit) {
        const reset = extractResetAtFromText(text, clock.now());
        noteHint({
          message: text,
          model: stringValue(assistant?.model),
          provider: stringValue(assistant?.provider),
          reason: "assistant error",
          resetAt: reset?.resetAt ?? latestHint?.resetAt,
          source: reset?.source ?? latestHint?.source ?? "assistant-message"
        });
      }
      const stoppedOnHint = !assistant || assistant?.stopReason === "error" || assistant?.stopReason === "aborted";
      if (!textShowsRateLimit && !stoppedOnHint) return false;
      return latestHint ? scheduleFromHint(latestHint, ctx) : false;
    },
    noteMessageEnd(event, _ctx) {
      const message2 = event?.message;
      if (!message2 || message2.role !== "assistant") return;
      const text = messageText(message2);
      if (!looksLikeRateLimitText(text)) return;
      const reset = extractResetAtFromText(text, clock.now());
      noteHint({
        message: text,
        model: stringValue(message2.model),
        provider: stringValue(message2.provider),
        reason: "assistant message",
        resetAt: reset?.resetAt ?? latestHint?.resetAt,
        source: reset?.source ?? latestHint?.source ?? "message_end"
      });
    },
    noteProviderResponse(event, _ctx) {
      if (Number(event?.status) !== 429) return;
      const reset = extractResetAtFromHeaders(event?.headers, clock.now());
      noteHint({
        model: stringValue(event?.model?.id) ?? stringValue(event?.model),
        provider: stringValue(event?.provider?.id) ?? stringValue(event?.provider),
        reason: "HTTP 429",
        resetAt: reset?.resetAt ?? latestHint?.resetAt,
        source: reset?.source ?? latestHint?.source ?? "after_provider_response"
      });
    },
    noteExternalRateLimitEvent(payload, _ctx) {
      const event = asRecord(payload);
      if (!event) return;
      const status = stringValue(event.status);
      if (status && status !== "rejected" && status !== "rate_limited" && status !== "error") return;
      const rawReset = numberValue(event.resetAtMs) ?? numberValue(event.resetAtUnixMs);
      const textReset = stringValue(event.resetAt) ?? stringValue(event.resetsAt);
      const parsedTextReset = textReset ? parseResetValueMs(textReset, clock.now()) : void 0;
      const resetAt = rawReset ?? parsedTextReset;
      noteHint({
        message: stringValue(event.message),
        model: stringValue(event.model),
        provider: stringValue(event.provider),
        reason: stringValue(event.reason) ?? stringValue(event.rateLimitType),
        resetAt: resetAt ?? latestHint?.resetAt,
        source: stringValue(event.source) ?? latestHint?.source ?? RATE_LIMIT_AUTO_RESUME_EVENT
      });
    },
    renderPreviewLines(width) {
      if (!pending) return [];
      const line = `| ${RATE_LIMIT_TOKEN} Auto-resume ${formatDueTime(pending.dueAt)} \u2014 ${previewMessage(pending.message)}`;
      return [truncateToWidth4(ansiRed(line), width, "")];
    },
    setOnChange(callback) {
      onChange = callback;
    },
    // Test helper / low-level extension bridge.
    scheduleForHint(hint, ctx) {
      latestHint = hint;
      return scheduleFromHint(hint, ctx);
    }
  };
}

// src/extensions/qol/session-rename.ts
function autoRenameEnabled(cwd) {
  return settingBoolean("sessionAutoRename.enabled", true, cwd);
}
function isStaleCtxError(error) {
  const message2 = error instanceof Error ? error.message : typeof error === "string" ? error : "";
  return /extension ctx is stale/i.test(message2);
}
function autoRenameCtxAlive(ctx) {
  try {
    return ctx.hasUI;
  } catch {
    return false;
  }
}
function readCtxCwd(ctx) {
  try {
    return ctx.cwd;
  } catch {
    return void 0;
  }
}
function autoRenameDebug(ctx, message2, level = "info") {
  if (!autoRenameCtxAlive(ctx)) return;
  if (settingBoolean("sessionAutoRename.debug", false, ctx.cwd)) ctx.ui.notify(`[auto-rename] ${message2}`, level);
}
function autoRenameNotify(ctx, message2, level = "info", force = false) {
  if (!autoRenameCtxAlive(ctx)) return;
  if (force || settingBoolean("sessionAutoRename.notify", false, ctx.cwd) || settingBoolean("sessionAutoRename.debug", false, ctx.cwd)) ctx.ui.notify(`[auto-rename] ${message2}`, level);
}
function firstUserMessageText(branch) {
  for (const entry of branch) {
    if (entry.type !== "message" || entry.message?.role !== "user") continue;
    const text = textFromContent(entry.message.content).trim();
    if (text) return text;
  }
  return void 0;
}
function conversationTranscriptText(branch, maxChars) {
  const lines = [];
  for (const entry of branch) {
    if (entry.type !== "message") continue;
    const role = entry.message?.role;
    if (role !== "user" && role !== "assistant") continue;
    const text = textFromContent(entry.message.content).trim();
    if (!text) continue;
    lines.push(`${role === "user" ? "User" : "Assistant"}: ${text}`);
  }
  const transcript = lines.join("\n\n").trim();
  return transcript ? truncateMiddle(transcript, maxChars) : void 0;
}
function truncateMiddle(text, maxChars) {
  const max = Math.max(200, Math.floor(maxChars));
  if (text.length <= max) return text;
  const marker = "\n[...truncated...]\n";
  const budget = max - marker.length;
  if (budget <= 0) return text.slice(0, max);
  const headBudget = Math.ceil(budget * 0.6);
  const tailBudget = budget - headBudget;
  let head = text.slice(0, headBudget);
  const headSpace = head.lastIndexOf(" ");
  if (headSpace > headBudget * 0.6) head = head.slice(0, headSpace);
  let tail = text.slice(text.length - tailBudget);
  const tailSpace = tail.indexOf(" ");
  if (tailSpace >= 0 && tailSpace < tailBudget * 0.4) tail = tail.slice(tailSpace + 1);
  return `${head}${marker}${tail}`;
}
function clampAutoRenameName(name, maxChars) {
  const max = Math.max(20, Math.floor(maxChars));
  let cleaned = oneLine(name).replace(/[.!?:;,]+$/g, "").trim();
  if (cleaned.length <= max) return cleaned;
  const truncated = cleaned.slice(0, max).trimEnd();
  const lastSpace = truncated.lastIndexOf(" ");
  cleaned = lastSpace > max * 0.45 ? truncated.slice(0, lastSpace) : truncated;
  return cleaned.replace(/[,;:\s]+$/g, "").trim();
}
function stripAutoRenameThinkTags(text) {
  return text.replace(/<think>[\s\S]*?<\/think>/gi, "").replace(/<thinking>[\s\S]*?<\/thinking>/gi, "").replace(/<think>[\s\S]*/gi, "").replace(/<thinking>[\s\S]*/gi, "").trim();
}
function normalizeAutoRenameCandidate(line) {
  return line.replace(/<[^>]+>/g, " ").replace(/^\s*(?:final\s+)?(?:title|name|session\s+name)\s*[:\-]\s*/i, "").replace(/^[\s\-*>#•]+/, "").replace(/^\d+[.)]\s*/, "").replace(/\*\*/g, "").replace(/`/g, "").replace(/^["'“”‘’]+|["'“”‘’]+$/g, "").replace(/\s+/g, " ").trim();
}
function looksLikeAutoRenameReasoning(line) {
  if (!line) return true;
  if (/\b(here'?s|i would|best title|candidate|option|reasoning|analysis|thinking)\b/i.test(line)) return true;
  if (/[{}<>|]/.test(line)) return true;
  const words = line.split(/\s+/).filter(Boolean);
  return words.length === 0 || words.length > 12;
}
function autoRenameResponseText(response) {
  const blocks = Array.isArray(response?.content) ? response.content : [];
  const text = blocks.filter((block) => block?.type === "text" && typeof block.text === "string").map((block) => block.text).join("\n").trim();
  if (text) return text;
  return blocks.filter((block) => block?.type === "thinking" && typeof block.thinking === "string").map((block) => block.thinking).join("\n").trim();
}
function sanitizeAutoRenameName(raw, maxChars) {
  const stripped = stripAutoRenameThinkTags(raw);
  const lines = stripped.split(/\r?\n/).map(normalizeAutoRenameCandidate).filter(Boolean);
  let name = "";
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    if (!looksLikeAutoRenameReasoning(lines[index])) {
      name = lines[index];
      break;
    }
  }
  if (!name && lines.length > 0) name = [...lines].sort((a, b) => a.length - b.length)[0];
  name = clampAutoRenameName(name, maxChars);
  return name && !looksLikeAutoRenameReasoning(name) ? name : void 0;
}
function titleCaseWord(word) {
  return word ? `${word.charAt(0).toUpperCase()}${word.slice(1).toLowerCase()}` : word;
}
function autoRenameFallbackMode(cwd) {
  const configured = settingString("sessionAutoRename.fallback", "words", cwd).toLowerCase();
  return configured === "none" || configured === "truncate" ? configured : "words";
}
function deterministicAutoRenameName(query, cwd) {
  const mode = autoRenameFallbackMode(cwd);
  if (mode === "none") return void 0;
  const maxChars = settingNumber("sessionAutoRename.maxNameChars", DEFAULT_AUTO_RENAME_NAME_CHARS, cwd);
  const cleaned = oneLine(query).replace(/[`"'“”‘’]/g, "").replace(/[^\w\s./-]/g, " ").replace(/\s+/g, " ").trim();
  if (!cleaned) return void 0;
  if (mode === "truncate") return clampAutoRenameName(cleaned, Math.min(maxChars, 50));
  const words = cleaned.split(/\s+/).filter(Boolean).slice(0, 6).map(titleCaseWord);
  return clampAutoRenameName(words.join(" "), maxChars);
}
function autoRenamePrompt(query, cwd) {
  const maxChars = Math.max(200, Math.floor(settingNumber("sessionAutoRename.maxInputChars", DEFAULT_AUTO_RENAME_INPUT_CHARS, cwd)));
  const message2 = truncateMiddle(query, maxChars);
  const configured = settingStringAllowEmpty("sessionAutoRename.prompt", "", cwd);
  const template = configured || DEFAULT_AUTO_RENAME_PROMPT;
  if (template.includes("{{message}}")) return template.split("{{message}}").join(message2);
  return `${template.trim()}

First user message:
${message2}`.trim();
}
function disabledModelSetting(value) {
  const normalized = value.trim().toLowerCase();
  return !normalized || normalized === "none" || normalized === "off" || normalized === "disabled";
}
function autoRenameModelSettings(cwd) {
  const primary = settingString("sessionAutoRename.model", DEFAULT_AUTO_RENAME_MODEL, cwd);
  const fallback = settingStringAllowEmpty("sessionAutoRename.fallbackModel", DEFAULT_AUTO_RENAME_FALLBACK_MODEL, cwd);
  const candidates = [primary];
  if (primary === DEFAULT_AUTO_RENAME_MODEL) candidates.push("openai-codex/gpt-5.3-codex-spark");
  candidates.push(fallback);
  return candidates.map((value) => value.trim()).filter((value) => !disabledModelSetting(value)).filter((value, index, all) => all.findIndex((candidate) => candidate.toLowerCase() === value.toLowerCase()) === index);
}
function headerRecord(headers) {
  if (!headers || typeof headers !== "object" || Array.isArray(headers)) return void 0;
  const entries = Object.entries(headers).filter((entry) => entry[1] === null || typeof entry[1] === "string" && entry[1].length > 0);
  return entries.length > 0 ? Object.fromEntries(entries) : void 0;
}
function modelCost(model) {
  const cost = model?.cost;
  return Number(cost?.input ?? 0) + Number(cost?.output ?? 0);
}
async function cheapestAvailableAutoRenameModel(ctx) {
  let registry;
  try {
    registry = ctx.modelRegistry;
  } catch (error) {
    if (isStaleCtxError(error)) return void 0;
    throw error;
  }
  const rawModels = typeof registry.getAvailable === "function" ? registry.getAvailable() : typeof registry.getAll === "function" ? registry.getAll() : [];
  const models = Array.isArray(rawModels) ? rawModels.filter((model) => model?.input?.includes?.("text") ?? true) : [];
  models.sort((a, b) => modelCost(a) - modelCost(b) || modelLabel(a).localeCompare(modelLabel(b)));
  for (const model of models) {
    try {
      const auth = await ctx.modelRegistry.getApiKeyAndHeaders(model);
      const headers = headerRecord(auth.headers);
      if (auth.ok) return { apiKey: auth.apiKey, env: auth.env, headers, label: modelLabel(model), model, source: "cheapest" };
    } catch (error) {
      if (isStaleCtxError(error)) return void 0;
    }
  }
  return void 0;
}
async function resolveAutoRenameModel(ctx, configured) {
  try {
    if (configured.trim().toLowerCase() === "cheapest") return await cheapestAvailableAutoRenameModel(ctx);
    const model = resolveConfiguredModel(ctx, configured);
    if (!model) {
      autoRenameDebug(ctx, `model not found: ${configured}`, "warning");
      return void 0;
    }
    try {
      const auth = await ctx.modelRegistry.getApiKeyAndHeaders(model);
      const headers = headerRecord(auth.headers);
      if (!auth.ok) {
        autoRenameDebug(ctx, `auth unavailable for ${modelLabel(model)}: ${auth.error}`, "warning");
        return void 0;
      }
      return { apiKey: auth.apiKey, env: auth.env, headers, label: modelLabel(model), model, source: configured };
    } catch (error) {
      if (isStaleCtxError(error)) return void 0;
      autoRenameDebug(ctx, `auth failed for ${modelLabel(model)}: ${stringifyError(error)}`, "warning");
      return void 0;
    }
  } catch (error) {
    if (isStaleCtxError(error)) return void 0;
    throw error;
  }
}
async function generateAutoRenameName(query, ctx, fullConversation = false) {
  const cwd = readCtxCwd(ctx);
  const maxNameChars = Math.max(20, Math.floor(settingNumber("sessionAutoRename.maxNameChars", DEFAULT_AUTO_RENAME_NAME_CHARS, cwd)));
  const maxTokens = Math.max(16, Math.floor(settingNumber("sessionAutoRename.maxTokens", DEFAULT_AUTO_RENAME_MAX_TOKENS, cwd)));
  const prompt = fullConversation ? `${AUTO_RENAME_SYSTEM_PROMPT}

Name this session using the conversation transcript below. Return only the title.

${query}` : autoRenamePrompt(query, cwd);
  const message2 = {
    content: [{ text: prompt, type: "text" }],
    role: "user",
    timestamp: Date.now()
  };
  for (const configured of autoRenameModelSettings(cwd)) {
    const resolved = await resolveAutoRenameModel(ctx, configured);
    if (!resolved) continue;
    try {
      const controller = new AbortController();
      const timeoutMs = Math.max(1e3, Math.floor(settingNumber("sessionAutoRename.timeoutMs", DEFAULT_AUTO_RENAME_TIMEOUT_MS, cwd)));
      const timeout = setTimeout(() => controller.abort(), timeoutMs);
      timeout.unref?.();
      try {
        const response = await complete(
          resolved.model,
          { messages: [message2], systemPrompt: AUTO_RENAME_SYSTEM_PROMPT },
          { apiKey: resolved.apiKey, env: resolved.env, headers: resolved.headers, maxTokens, signal: controller.signal, onPayload: gatewayPrivacyOnPayload(ctx) }
        );
        if (response.stopReason === "error") {
          autoRenameDebug(ctx, `${resolved.label} failed: ${response.errorMessage ?? "unknown error"}`, "warning");
          continue;
        }
        const name = sanitizeAutoRenameName(autoRenameResponseText(response), maxNameChars);
        if (name) return { name, source: resolved.label };
        autoRenameDebug(ctx, `${resolved.label} returned no usable title`, "warning");
      } finally {
        clearTimeout(timeout);
      }
    } catch (error) {
      if (isStaleCtxError(error)) return { source: "none" };
      autoRenameDebug(ctx, `${resolved.label} failed: ${stringifyError(error)}`, "warning");
    }
  }
  const deterministic = deterministicAutoRenameName(query, cwd);
  return deterministic ? { name: deterministic, source: `fallback:${autoRenameFallbackMode(cwd)}` } : { source: "none" };
}
function withAutoRenamePrefix(name, cwd) {
  const maxNameChars = Math.max(20, Math.floor(settingNumber("sessionAutoRename.maxNameChars", DEFAULT_AUTO_RENAME_NAME_CHARS, cwd)));
  const prefix = clampAutoRenameName(settingStringAllowEmpty("sessionAutoRename.prefix", "", cwd), 40);
  return clampAutoRenameName(prefix ? `${prefix}: ${name}` : name, maxNameChars);
}

// src/extensions/qol/schedule.ts
import { truncateToWidth as truncateToWidth5 } from "@earendil-works/pi-tui";
var SCHEDULE_ENTRY_TYPE = "qol-schedule";
var MAX_TIMER_DELAY_MS2 = 2147e6;
var MAX_SCHEDULE_DELAY_MS = 30 * 24 * 60 * 60 * 1e3;
var MAX_ACTIVE_SCHEDULES = 100;
var DEFAULT_CLOCK2 = {
  now: () => Date.now(),
  setTimeout: (callback, delayMs) => setTimeout(callback, delayMs),
  clearTimeout: (timer) => clearTimeout(timer)
};
var SCHEDULE_COMPLETIONS = [
  { value: "list", label: "list", description: "Show pending scheduled messages" },
  { value: "cancel ", label: "cancel <id|all>", description: "Cancel one scheduled message or all pending messages" },
  { value: "20m ", label: "20m <message>", description: "Send a message after 20 minutes" },
  { value: "1h30m ", label: "1h30m <message>", description: "Send a message after 1 hour 30 minutes" },
  { value: "1h ", label: "1h <message>", description: "Send a message after 1 hour" }
];
function getScheduleArgumentCompletions(prefix) {
  const query = prefix.trimStart().toLowerCase();
  const filtered = SCHEDULE_COMPLETIONS.filter((item) => item.value.toLowerCase().startsWith(query) || (item.label ?? item.value).toLowerCase().startsWith(query));
  return filtered.length > 0 ? filtered : null;
}
function parseDurationMs(input) {
  const text = input.trim().toLowerCase();
  if (!text) return void 0;
  if (/^\d+(?:\.\d+)?$/.test(text)) return clampScheduleDelay(Number(text) * 60 * 1e3);
  let totalMs = 0;
  let matched = false;
  let previousRank = Number.POSITIVE_INFINITY;
  const seenUnits = /* @__PURE__ */ new Set();
  const re = /(\d+(?:\.\d+)?)(ms|seconds?|secs?|s|minutes?|mins?|min|m|hours?|hrs?|hr|h|days?|d)/gy;
  while (re.lastIndex < text.length) {
    const match = re.exec(text);
    if (!match) return void 0;
    const amount = Number(match[1]);
    const unit = scheduleUnit(match[2]);
    if (!Number.isFinite(amount) || amount < 0 || !unit) return void 0;
    if (seenUnits.has(unit.name) || unit.rank >= previousRank) return void 0;
    seenUnits.add(unit.name);
    previousRank = unit.rank;
    totalMs += amount * unit.multiplier;
    matched = true;
  }
  const delayMs = Math.round(totalMs);
  return matched ? clampScheduleDelay(delayMs) : void 0;
}
function clampScheduleDelay(delayMs) {
  if (!Number.isFinite(delayMs) || delayMs <= 0 || delayMs > MAX_SCHEDULE_DELAY_MS) return void 0;
  return delayMs;
}
function scheduleUnit(unit) {
  if (unit === "ms") return { multiplier: 1, name: "ms", rank: 0 };
  if (["s", "sec", "secs", "second", "seconds"].includes(unit)) return { multiplier: 1e3, name: "s", rank: 1 };
  if (["m", "min", "mins", "minute", "minutes"].includes(unit)) return { multiplier: 60 * 1e3, name: "m", rank: 2 };
  if (["h", "hr", "hrs", "hour", "hours"].includes(unit)) return { multiplier: 60 * 60 * 1e3, name: "h", rank: 3 };
  if (["d", "day", "days"].includes(unit)) return { multiplier: 24 * 60 * 60 * 1e3, name: "d", rank: 4 };
  return void 0;
}
function parseScheduleCommandArgs(args) {
  const trimmed = args.trim();
  if (!trimmed) return { kind: "list" };
  const firstSpace = trimmed.search(/\s/);
  const head = (firstSpace < 0 ? trimmed : trimmed.slice(0, firstSpace)).toLowerCase();
  const rest = firstSpace < 0 ? "" : trimmed.slice(firstSpace + 1).trim();
  if (head === "list" || head === "ls" || head === "status") return { kind: "list" };
  if (head === "cancel" || head === "clear") {
    if (!rest) return { kind: "usage", error: "Usage: /schedule cancel <id|all>" };
    if (rest.toLowerCase() === "all") return { kind: "cancel", all: true };
    return { kind: "cancel", all: false, id: rest };
  }
  const delayMs = parseDurationMs(head);
  if (delayMs === void 0) return { kind: "usage", error: "Usage: /schedule <duration> <message>" };
  if (!rest) return { kind: "usage", error: "Usage: /schedule <duration> <message>" };
  return { kind: "schedule", delayMs, message: rest };
}
function formatScheduleDuration(ms) {
  const totalSeconds = Math.max(0, Math.round(ms / 1e3));
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor(totalSeconds % 86400 / 3600);
  const minutes = Math.floor(totalSeconds % 3600 / 60);
  const seconds = totalSeconds % 60;
  const parts = [];
  if (days) parts.push(`${days}d`);
  if (hours) parts.push(`${hours}h`);
  if (minutes) parts.push(`${minutes}m`);
  if (seconds || parts.length === 0) parts.push(`${seconds}s`);
  return parts.slice(0, 2).join(" ");
}
function previewMessage2(message2, max = 80) {
  const singleLine = message2.replace(/\s+/g, " ").trim();
  if (singleLine.length <= max) return singleLine;
  return `${singleLine.slice(0, Math.max(0, max - 1))}\u2026`;
}
function formatDueTime2(timestamp) {
  return new Date(timestamp).toLocaleString();
}
function usageText() {
  return [
    "Usage: /schedule <duration> <message>",
    "Examples: /schedule 20m retry the previous request",
    "          /schedule 1h30m retry after the rate limit reset",
    "Durations: 20, 20m, 90s, 500ms, 1h45m30s (bare numbers mean minutes)",
    "Manage: /schedule list, /schedule cancel <id|all>"
  ].join("\n");
}
function dataToJob(data) {
  if (data.action !== "scheduled") return void 0;
  if (!data.id || typeof data.id !== "string") return void 0;
  if (!data.message || typeof data.message !== "string") return void 0;
  if (typeof data.createdAt !== "number" || typeof data.dueAt !== "number") return void 0;
  if (!Number.isFinite(data.createdAt) || !Number.isFinite(data.dueAt)) return void 0;
  return { createdAt: data.createdAt, dueAt: data.dueAt, id: data.id, message: data.message };
}
function createScheduleController(pi, clock = DEFAULT_CLOCK2) {
  let onChange;
  let sequence = 0;
  const jobs = /* @__PURE__ */ new Map();
  const notifyChanged = () => {
    try {
      onChange?.();
    } catch {
    }
  };
  const nextId = () => {
    let id = "";
    do {
      sequence += 1;
      id = `${clock.now().toString(36)}-${sequence.toString(36)}`;
    } while (jobs.has(id));
    return id;
  };
  const appendEntry = (data) => {
    try {
      pi.appendEntry?.(SCHEDULE_ENTRY_TYPE, data);
    } catch {
    }
  };
  const clearJobTimer = (job) => {
    if (!job.timer) return;
    clock.clearTimeout(job.timer);
    job.timer = void 0;
  };
  const armJob = (job, ctx) => {
    clearJobTimer(job);
    const remaining = Math.max(0, job.dueAt - clock.now());
    job.timer = clock.setTimeout(() => {
      if (!jobs.has(job.id)) return;
      if (clock.now() < job.dueAt) {
        armJob(job, ctx);
        return;
      }
      void deliver(job, ctx);
    }, Math.min(remaining, MAX_TIMER_DELAY_MS2));
    job.timer.unref?.();
  };
  const deliver = async (job, ctx) => {
    if (!jobs.has(job.id)) return;
    jobs.delete(job.id);
    clearJobTimer(job);
    notifyChanged();
    try {
      let idle = true;
      try {
        idle = ctx.isIdle?.() ?? true;
      } catch {
        idle = false;
      }
      await Promise.resolve(idle ? pi.sendUserMessage(job.message) : pi.sendUserMessage(job.message, { deliverAs: "followUp" }));
      appendEntry({ action: "delivered", deliveredAt: clock.now(), id: job.id });
      if (ctx.hasUI) ctx.ui.notify(`Scheduled message sent (${job.id}).`, "info");
    } catch (error) {
      appendEntry({ action: "failed", failedAt: clock.now(), id: job.id, message: stringifyError(error) });
      if (ctx.hasUI) ctx.ui.notify(`Scheduled message failed (${job.id}): ${stringifyError(error)}`, "error");
    }
  };
  const listText = () => {
    const now = clock.now();
    const pending = [...jobs.values()].sort((a, b) => a.dueAt - b.dueAt);
    if (pending.length === 0) return "No scheduled messages.";
    return [
      "Scheduled messages:",
      ...pending.map((job) => `${job.id} \u2014 in ${formatScheduleDuration(job.dueAt - now)} (${formatDueTime2(job.dueAt)}) \u2014 ${previewMessage2(job.message)}`)
    ].join("\n");
  };
  const schedule = (delayMs, message2, ctx) => {
    if (jobs.size >= MAX_ACTIVE_SCHEDULES) {
      ctx.ui.notify(`Too many scheduled messages (${MAX_ACTIVE_SCHEDULES}). Cancel one before adding another.`, "warning");
      return;
    }
    const createdAt = clock.now();
    const job = { createdAt, dueAt: createdAt + delayMs, id: nextId(), message: message2 };
    jobs.set(job.id, job);
    appendEntry({ action: "scheduled", createdAt: job.createdAt, dueAt: job.dueAt, id: job.id, message: job.message });
    armJob(job, ctx);
    notifyChanged();
    ctx.ui.notify(`Scheduled ${job.id} in ${formatScheduleDuration(delayMs)} (${formatDueTime2(job.dueAt)}): ${previewMessage2(message2)}`, "info");
  };
  const cancel = (id) => {
    const job = jobs.get(id);
    if (!job) return false;
    clearJobTimer(job);
    jobs.delete(id);
    appendEntry({ action: "cancelled", cancelledAt: clock.now(), id });
    notifyChanged();
    return true;
  };
  return {
    activeCount() {
      return jobs.size;
    },
    clearTimers() {
      for (const job of jobs.values()) clearJobTimer(job);
      const changed = jobs.size > 0;
      jobs.clear();
      if (changed) notifyChanged();
    },
    async handleCommand(args, ctx) {
      const parsed = parseScheduleCommandArgs(args);
      if (parsed.kind === "usage") {
        ctx.ui.notify(`${parsed.error ?? "Invalid schedule command"}
${usageText()}`, "warning");
        return;
      }
      if (parsed.kind === "list") {
        ctx.ui.notify(`${listText()}

${usageText()}`, "info");
        return;
      }
      if (parsed.kind === "cancel") {
        if (parsed.all) {
          const count = jobs.size;
          for (const job of [...jobs.values()]) cancel(job.id);
          ctx.ui.notify(`Cancelled ${count} scheduled message(s).`, "info");
          return;
        }
        if (!parsed.id || !cancel(parsed.id)) {
          ctx.ui.notify(`No scheduled message found for ${parsed.id ?? "<missing id>"}.`, "warning");
          return;
        }
        ctx.ui.notify(`Cancelled scheduled message ${parsed.id}.`, "info");
        return;
      }
      schedule(parsed.delayMs, parsed.message, ctx);
    },
    restoreFromBranch(ctx) {
      for (const job of jobs.values()) clearJobTimer(job);
      jobs.clear();
      const branch = ctx.sessionManager.getBranch?.() ?? [];
      for (const entry of branch) {
        if (entry?.type !== "custom" || entry.customType !== SCHEDULE_ENTRY_TYPE) continue;
        const data = entry.data;
        if (!data || typeof data !== "object") continue;
        if (data.action === "scheduled") {
          const job = dataToJob(data);
          if (job) jobs.set(job.id, job);
          continue;
        }
        if (typeof data.id === "string") jobs.delete(data.id);
      }
      for (const job of jobs.values()) armJob(job, ctx);
      notifyChanged();
    },
    renderPreviewLines(width) {
      const pending = [...jobs.values()].sort((a, b) => a.dueAt - b.dueAt);
      const shown = pending.slice(0, 3).map((job) => {
        const line = `\u2503 Scheduled ${formatDueTime2(job.dueAt)} \u2014 ${previewMessage2(job.message, 120)}`;
        return truncateToWidth5(ansiGreen(line), width, "");
      });
      if (pending.length > shown.length) shown.push(truncateToWidth5(ansiGreen(`\u2503 Scheduled: +${pending.length - shown.length} more`), width, ""));
      return shown;
    },
    setOnChange(callback) {
      onChange = callback;
    }
  };
}

// src/extensions/qol/session-search/cache.ts
import { realpath } from "node:fs/promises";
import { homedir as homedir2 } from "node:os";
import { basename as basename3, dirname as dirname3, isAbsolute as isAbsolute2, join as join4, resolve as resolve3 } from "node:path";
import { SessionManager } from "@earendil-works/pi-coding-agent";

// src/extensions/qol/session-search/jsonl.ts
import { closeSync, createReadStream, openSync, readSync } from "node:fs";
import { StringDecoder } from "node:string_decoder";
async function forEachSessionJsonlLineAsync(sessionPath, onLine, signal, options) {
  const stream = createReadStream(sessionPath, { signal, highWaterMark: 64 * 1024 });
  const decoder = new StringDecoder("utf8");
  const maxLineChars = options?.maxLineChars ?? 2 * 1024 * 1024;
  let pending = "";
  let skipping = false;
  try {
    for await (const chunk of stream) {
      signal.throwIfAborted();
      const text = decoder.write(chunk);
      let start = 0;
      for (; ; ) {
        const end = text.indexOf("\n", start);
        const part = text.slice(start, end < 0 ? void 0 : end);
        if (!skipping && pending.length + part.length <= maxLineChars) pending += part;
        else {
          pending = "";
          skipping = true;
        }
        if (end < 0) break;
        if (!skipping && onLine(pending.endsWith("\r") ? pending.slice(0, -1) : pending) === false) return;
        pending = "";
        skipping = false;
        start = end + 1;
      }
    }
    pending += decoder.end();
    if (!skipping && pending.length > 0) onLine(pending.endsWith("\r") ? pending.slice(0, -1) : pending);
  } finally {
    stream.destroy();
  }
}
function forEachSessionJsonlLine(sessionPath, onLine, chunkSize = 64 * 1024) {
  const fd = openSync(sessionPath, "r");
  const buffer = Buffer.allocUnsafe(Math.max(1, Math.floor(chunkSize)));
  const decoder = new StringDecoder("utf8");
  let pending = "";
  try {
    for (; ; ) {
      const bytesRead = readSync(fd, buffer, 0, buffer.length, null);
      if (bytesRead === 0) break;
      pending += decoder.write(buffer.subarray(0, bytesRead));
      let start = 0;
      for (; ; ) {
        const newline = pending.indexOf("\n", start);
        if (newline < 0) {
          pending = pending.slice(start);
          break;
        }
        const line = pending.slice(start, newline);
        onLine(line.endsWith("\r") ? line.slice(0, -1) : line);
        start = newline + 1;
      }
    }
    pending += decoder.end();
    if (pending.length > 0) onLine(pending.endsWith("\r") ? pending.slice(0, -1) : pending);
  } finally {
    closeSync(fd);
  }
}

// src/extensions/qol/session-search/cache.ts
var qolSessionSearchCache = [];
var qolSessionSearchLoadedAt = 0;
var qolSessionSearchLoading;
var qolSessionSearchLoadController;
var qolSessionSearchReleaseTimer;
var qolSessionUserMessagesCache = /* @__PURE__ */ new Map();
var qolSessionSearchPendingAction;
var qolSessionSearchPendingActionCounter = 0;
function queueSessionSearchPendingAction(action) {
  const id = `ss-${Date.now().toString(36)}-${(++qolSessionSearchPendingActionCounter).toString(36)}`;
  qolSessionSearchPendingAction = { id, action };
  return id;
}
function takeSessionSearchPendingAction(id) {
  if (qolSessionSearchPendingAction?.id !== id) return void 0;
  const { action } = qolSessionSearchPendingAction;
  qolSessionSearchPendingAction = void 0;
  return action;
}
function clearSessionSearchPendingAction() {
  qolSessionSearchPendingAction = void 0;
}
function getPendingSessionSearchMessage() {
  return globalThis[SESSION_SEARCH_PENDING_SYMBOL];
}
function setPendingSessionSearchMessage(message2) {
  const host = globalThis;
  if (message2) host[SESSION_SEARCH_PENDING_SYMBOL] = message2;
  else delete host[SESSION_SEARCH_PENDING_SYMBOL];
}
function coerceDate(value) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
  const date = new Date(typeof value === "string" || typeof value === "number" ? value : 0);
  return Number.isNaN(date.getTime()) ? /* @__PURE__ */ new Date(0) : date;
}
function sessionInfoToSearchSession(info) {
  if (!info || typeof info.path !== "string") return void 0;
  return {
    allMessagesText: typeof info.allMessagesText === "string" ? info.allMessagesText : "",
    created: coerceDate(info.created),
    cwd: typeof info.cwd === "string" ? info.cwd : "",
    firstMessage: typeof info.firstMessage === "string" ? info.firstMessage : "(no messages)",
    id: typeof info.id === "string" ? info.id : basename3(info.path),
    messageCount: Number.isFinite(Number(info.messageCount)) ? Number(info.messageCount) : 0,
    modified: coerceDate(info.modified),
    name: typeof info.name === "string" && info.name.trim() ? info.name.trim() : void 0,
    parentSessionPath: typeof info.parentSessionPath === "string" ? info.parentSessionPath : void 0,
    path: info.path
  };
}
function resolveSettingsRelativePath(value, settingsPath) {
  const expanded = expandHome(value.trim());
  return isAbsolute2(expanded) ? expanded : resolve3(dirname3(settingsPath), expanded);
}
function sessionSearchShortcut(cwd) {
  if (!settingBoolean("sessionSearch.ctrlFShortcut", true, cwd)) return void 0;
  const shortcut = settingStringAllowEmpty("sessionSearch.shortcutKey", DEFAULT_SESSION_SEARCH_SHORTCUT, cwd).trim().toLowerCase();
  if (!shortcut || shortcut === "none" || shortcut === "off" || shortcut === "false") return void 0;
  if (shortcut === "f3") return DEFAULT_SESSION_SEARCH_SHORTCUT;
  return shortcut;
}
function configuredSessionDir(cwd) {
  const envDir = process.env.PI_CODING_AGENT_SESSION_DIR?.trim();
  if (envDir) return resolveSettingsRelativePath(envDir, join4(resolve3(cwd), ".pi", "settings.json"));
  let configured;
  for (const file of readSettingsFiles(piSettingsPaths(cwd))) {
    if (file.kind !== "parsed") continue;
    const sessionDir = file.settings.sessionDir;
    if (typeof sessionDir === "string" && sessionDir.trim()) configured = resolveSettingsRelativePath(sessionDir, file.path);
  }
  return configured;
}
async function canonicalPathForSessionSearch(path) {
  try {
    return await realpath(path);
  } catch (error) {
    if (["ENOENT", "ENOTDIR"].includes(error.code ?? "")) return resolve3(path);
    throw error;
  }
}
async function prepareQolSessionSearchSessions(sessions, signal) {
  const paths = /* @__PURE__ */ new Map();
  let budget = SESSION_SEARCH_TEXT_MAX_CHARS;
  const prepared = [];
  for (const session of [...sessions].sort((a, b) => b.modified.getTime() - a.modified.getTime())) {
    signal.throwIfAborted();
    let canonicalCwd = session.canonicalCwd ?? paths.get(session.cwd);
    if (canonicalCwd === void 0) {
      canonicalCwd = session.cwd ? await canonicalPathForSessionSearch(session.cwd) : "";
      paths.set(session.cwd, canonicalCwd);
    }
    const messages = [];
    let remaining = Math.min(SESSION_SEARCH_TEXT_MAX_CHARS_PER_SESSION, budget);
    const keep = (message2) => {
      if (remaining <= 0) return;
      const text = message2.text.slice(0, remaining);
      remaining -= text.length;
      budget -= text.length;
      messages.push({ ...message2, text });
    };
    if (session.userMessages !== void 0) session.userMessages.forEach(keep);
    else if (remaining > 0) {
      try {
        let index = 0;
        await forEachSessionJsonlLineAsync(session.path, (line) => {
          const message2 = userMessageFromLine(line, index + 1);
          if (message2) {
            index++;
            keep(message2);
          }
        }, signal);
      } catch (error) {
        signal.throwIfAborted();
        if (!["ENOENT", "ENOTDIR"].includes(error.code ?? "")) throw error;
      }
    }
    prepared.push({ ...session, canonicalCwd, userMessages: messages });
  }
  signal.throwIfAborted();
  return prepared;
}
function defaultSessionSearchScope(cwd) {
  return settingString("sessionSearch.defaultScope", "current", cwd).toLowerCase() === "all" ? "all" : "current";
}
function capSessionSearchText(sessions) {
  let budget = SESSION_SEARCH_TEXT_MAX_CHARS;
  const newestFirst = [...sessions].sort((a, b) => b.modified.getTime() - a.modified.getTime());
  for (const session of newestFirst) {
    const kept = session.allMessagesText.slice(0, Math.min(SESSION_SEARCH_TEXT_MAX_CHARS_PER_SESSION, budget));
    budget -= kept.length;
    session.allMessagesText = kept;
  }
  return sessions;
}
async function loadQolSessionSearchSessions(ctx, signal, onProgress) {
  const customSessionDir = configuredSessionDir(ctx.cwd);
  const infos = customSessionDir ? await SessionManager.list(ctx.cwd, customSessionDir, onProgress, signal) : await SessionManager.listAll(onProgress, signal);
  signal.throwIfAborted();
  return prepareQolSessionSearchSessions(capSessionSearchText(infos.map(sessionInfoToSearchSession).filter((session) => session !== void 0)), signal);
}
function releaseQolSessionSearchCache() {
  qolSessionSearchLoadController?.abort();
  qolSessionSearchLoadController = void 0;
  qolSessionSearchLoading = void 0;
  if (qolSessionSearchReleaseTimer) clearTimeout(qolSessionSearchReleaseTimer);
  qolSessionSearchReleaseTimer = void 0;
  qolSessionSearchCache = [];
  qolSessionSearchLoadedAt = 0;
  qolSessionUserMessagesCache.clear();
}
async function refreshQolSessionSearchCache(ctx, options) {
  const ttlMs = Math.max(0, settingNumber("sessionSearch.cacheTtlSeconds", DEFAULT_SESSION_SEARCH_CACHE_TTL_SECONDS, ctx.cwd) * 1e3);
  const fresh = qolSessionSearchCache.length > 0 && (ttlMs === 0 || Date.now() - qolSessionSearchLoadedAt < ttlMs);
  if (!options?.force && fresh) return qolSessionSearchCache;
  if (qolSessionSearchLoading) return qolSessionSearchLoading;
  if (!options?.quiet && ctx.hasUI) ctx.ui.setStatus(SESSION_SEARCH_STATUS_KEY, "Loading sessions...");
  const controller = new AbortController();
  qolSessionSearchLoadController = controller;
  qolSessionSearchLoading = loadQolSessionSearchSessions(ctx, controller.signal, (loaded, total) => {
    if (controller.signal.aborted) return;
    if (!options?.quiet && ctx.hasUI) ctx.ui.setStatus(SESSION_SEARCH_STATUS_KEY, `Loading sessions ${loaded}/${total}`);
  }).then((sessions) => {
    controller.signal.throwIfAborted();
    qolSessionSearchLoadController = void 0;
    releaseQolSessionSearchCache();
    qolSessionSearchCache = sessions;
    qolSessionSearchLoadedAt = Date.now();
    if (ttlMs > 0) {
      qolSessionSearchReleaseTimer = setTimeout(releaseQolSessionSearchCache, ttlMs);
      qolSessionSearchReleaseTimer.unref?.();
    }
    return sessions;
  }).finally(() => {
    if (qolSessionSearchLoadController === controller || !controller.signal.aborted) {
      qolSessionSearchLoadController = void 0;
      qolSessionSearchLoading = void 0;
      if (!options?.quiet && ctx.hasUI) ctx.ui.setStatus(SESSION_SEARCH_STATUS_KEY, void 0);
    }
  });
  return qolSessionSearchLoading;
}
function messageContentText(content) {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content.map((part) => {
    if (part?.type === "text" && typeof part.text === "string") return part.text;
    if (part?.type === "image") return "[image]";
    return "";
  }).filter(Boolean).join(" ");
}
function sessionMessageTimestamp(entry, message2) {
  if (typeof message2?.timestamp === "number" && Number.isFinite(message2.timestamp)) return message2.timestamp;
  if (typeof entry?.timestamp === "number" && Number.isFinite(entry.timestamp)) return entry.timestamp;
  if (typeof entry?.timestamp === "string") {
    const parsed = new Date(entry.timestamp).getTime();
    if (!Number.isNaN(parsed)) return parsed;
  }
  return void 0;
}
function userMessageFromLine(line, index, fullText = false) {
  let entry;
  try {
    entry = JSON.parse(line);
  } catch {
    return void 0;
  }
  const message2 = entry?.type === "message" ? entry.message : void 0;
  if (message2?.role !== "user") return void 0;
  const content = messageContentText(message2.content);
  const text = fullText ? content : oneLine(content);
  if (!text) return void 0;
  return {
    entryId: typeof entry.id === "string" ? entry.id : void 0,
    index,
    parentId: typeof entry.parentId === "string" || entry.parentId === null ? entry.parentId : void 0,
    text,
    timestamp: sessionMessageTimestamp(entry, message2)
  };
}
function sessionUserMessages(sessionPath) {
  const cached = qolSessionUserMessagesCache.get(sessionPath);
  if (cached) return cached;
  const messages = [];
  try {
    forEachSessionJsonlLine(sessionPath, (line) => {
      const message2 = userMessageFromLine(line, messages.length + 1);
      if (message2) messages.push(message2);
    });
  } catch {
  }
  qolSessionUserMessagesCache.set(sessionPath, messages);
  for (const oldest of qolSessionUserMessagesCache.keys()) {
    if (qolSessionUserMessagesCache.size <= SESSION_SEARCH_USER_MESSAGES_MAX_SESSIONS) break;
    qolSessionUserMessagesCache.delete(oldest);
  }
  return messages;
}
function userMessagesForResult(result) {
  const messages = result.userMessages ?? sessionUserMessages(result.path);
  if (messages.length > 0) return messages;
  return [{ index: 1, text: oneLine(result.firstMessage || "No user messages") }];
}
async function sessionUserMessageForAction(result, selected, signal = new AbortController().signal) {
  let found;
  let index = 0;
  await forEachSessionJsonlLineAsync(result.path, (line) => {
    const message2 = userMessageFromLine(line, index + 1, true);
    if (!message2) return;
    index++;
    if (selected?.entryId ? message2.entryId === selected.entryId : message2.index === (selected?.index ?? 1)) {
      found = message2;
      return false;
    }
  }, signal, { maxLineChars: Infinity });
  signal.throwIfAborted();
  if (!found) throw new Error(`Session prompt not found: ${selected?.entryId ?? selected?.index ?? 1}`);
  return found;
}
function sessionDisplayName(session) {
  if (session.name) return oneLine(session.name) || "session";
  if (session.cwd) {
    const parts = oneLine(session.cwd).split(/[\\/]+/).filter(Boolean);
    if (parts.length >= 2) return parts.slice(-2).join("/");
    if (parts.length === 1) return parts[0];
  }
  return oneLine(basename3(session.path) || "session") || "session";
}
function sessionResumeTitle(session) {
  if (session.name) return oneLine(session.name) || sessionDisplayName(session);
  if (session.firstMessage && session.firstMessage !== "(no messages)") return oneLine(session.firstMessage) || sessionDisplayName(session);
  return sessionDisplayName(session);
}
function shortPathForUi(path) {
  const cleaned = oneLine(path);
  const home = homedir2();
  if (cleaned === home) return "~";
  if (cleaned.startsWith(`${home}/`)) return `~${cleaned.slice(home.length)}`;
  return cleaned;
}
function sessionModelInfo(sessionPath) {
  try {
    const model = SessionManager.open(sessionPath).buildSessionContext().model;
    if (!model?.provider || !model?.modelId) return void 0;
    return { provider: model.provider, id: model.modelId };
  } catch {
    return void 0;
  }
}
function sameModel(a, b) {
  return Boolean(a && b && a.provider === b.provider && a.id === b.id);
}
function modelLabel2(model) {
  return model ? `${model.provider}/${model.id}` : "unknown model";
}
function pinSessionModel(sessionPath, model, thinkingLevel) {
  const manager = SessionManager.open(sessionPath);
  const context = manager.buildSessionContext();
  if (context.model?.provider !== model.provider || context.model?.modelId !== model.id) {
    manager.appendModelChange(model.provider, model.id);
  }
  if (thinkingLevel) {
    const branch = manager.getBranch();
    const lastThinking = [...branch].reverse().find((entry) => entry?.type === "thinking_level_change");
    if (lastThinking?.thinkingLevel !== thinkingLevel) manager.appendThinkingLevelChange(thinkingLevel);
  }
}

// src/extensions/qol/session-search/component.ts
import { matchesKey as matchesKey2, truncateToWidth as truncateToWidth6, visibleWidth as visibleWidth4, wrapTextWithAnsi } from "@earendil-works/pi-tui";

// src/extensions/qol/session-search/search.ts
import { setImmediate as yieldToInput } from "node:timers/promises";

// src/extensions/qol/session-search/regex.ts
import { Worker } from "node:worker_threads";
function sessionRegexMatches(source, texts, signal) {
  signal.throwIfAborted();
  return new Promise((resolve4, reject) => {
    const worker = new Worker(new URL("./regex-worker.mjs", import.meta.url), { execArgv: [], env: {} });
    let settled = false;
    let timer = setTimeout(() => finish(new Error("SESSION_SEARCH_REGEX_DEADLINE: worker startup")), 1e3);
    const finish = (error, matches) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal.removeEventListener("abort", abort);
      worker.removeAllListeners("message");
      worker.unref();
      void worker.terminate().catch((cleanupError) => {
        console.error("Session regex worker cleanup failed:", cleanupError);
      });
      if (error) reject(error);
      else resolve4(matches);
    };
    const abort = () => finish(new Error("Session search cancelled"));
    signal.addEventListener("abort", abort, { once: true });
    worker.on("message", (reply) => {
      if (settled) return;
      switch (reply.status) {
        case "ready":
          clearTimeout(timer);
          timer = setTimeout(() => finish(new Error("SESSION_SEARCH_REGEX_DEADLINE: 25 ms")), 25);
          worker.postMessage({ source, texts });
          break;
        case "matched":
          finish(void 0, reply.matches);
          break;
        default: {
          const unexpected = reply;
          finish(new Error(`Unknown regex worker reply: ${unexpected}`));
        }
      }
    });
    worker.once("error", (error) => finish(error));
    worker.once("exit", (code) => {
      if (!settled) finish(new Error(`Session regex worker exited before results: ${code}`));
    });
  });
}

// src/extensions/qol/session-search/search.ts
function normalizeSearchText(text) {
  return text.toLowerCase().replace(/\s+/g, " ").trim();
}
function parseSessionSearchQuery(query) {
  const trimmed = query.trim();
  if (!trimmed) return { mode: "tokens", tokens: [] };
  if (trimmed.startsWith("re:")) {
    const source = trimmed.slice(3).trim();
    if (!source) return { error: "Empty regex", mode: "regex", tokens: [] };
    try {
      return { mode: "regex", regex: new RegExp(source, "i"), tokens: [] };
    } catch (error) {
      return { error: stringifyError(error), mode: "regex", tokens: [] };
    }
  }
  const tokens = [];
  let buffer = "";
  let inQuote = false;
  const flush = (kind) => {
    const value = buffer.trim();
    buffer = "";
    if (value) tokens.push({ kind, value });
  };
  for (const char of trimmed) {
    if (char === '"') {
      flush(inQuote ? "phrase" : "fuzzy");
      inQuote = !inQuote;
    } else if (!inQuote && /\s/.test(char)) flush("fuzzy");
    else buffer += char;
  }
  if (inQuote) return { mode: "tokens", tokens: trimmed.split(/\s+/).filter(Boolean).map((value) => ({ kind: "fuzzy", value })) };
  flush("fuzzy");
  return { mode: "tokens", tokens };
}
function searchStringScore(needle, haystack) {
  const query = normalizeSearchText(needle);
  const text = normalizeSearchText(haystack);
  if (!query) return 0;
  let best;
  const record = (score) => {
    best = best === void 0 ? score : Math.min(best, score);
  };
  if (/^[a-z0-9_]+$/i.test(query)) {
    for (const match of text.matchAll(/[a-z0-9_]+/gi)) {
      const word = match[0].toLowerCase();
      const penalty = Math.max(0, word.length - query.length);
      if (word === query) record(0);
      else if (word.startsWith(query)) record(10 + penalty);
      else if (word.includes(query)) record(100 + penalty);
    }
    return best;
  }
  return text.includes(query) ? 0 : void 0;
}
function snippetAround(text, start, length, width, lead = Math.floor(width / 3)) {
  const safeStart = Math.max(0, start - Math.max(0, Math.min(width, lead)));
  const safeEnd = Math.min(text.length, Math.max(start + length, safeStart + width));
  return `${safeStart > 0 ? "\u2026" : ""}${text.slice(safeStart, safeEnd)}${safeEnd < text.length ? "\u2026" : ""}`;
}
function resultFromSession(session, rank = 0, snippets = []) {
  return { ...session, rank, snippets };
}
function matchTextSearch(text, parsed, regexMatches) {
  if (parsed.mode === "regex") return { matches: regexMatches.get(text) != null, score: 0 };
  let score = 0;
  for (const token of parsed.tokens) {
    const tokenScore = searchStringScore(token.value, text);
    if (tokenScore === void 0) return { matches: false, score: 0 };
    score += tokenScore;
  }
  return { matches: true, score };
}
function sessionTitleSearchText(session) {
  return [session.name ?? "", sessionResumeTitle(session), sessionDisplayName(session)].join("\n");
}
function buildPromptSnippet(message2, parsed, regexMatch) {
  if (parsed.mode === "regex" && regexMatch) return snippetAround(message2.text, regexMatch.index, Math.min(regexMatch.length, 160), 160, 24).replace(/\s+/g, " ").trim();
  const source = message2.text.replace(/\s+/g, " ").trim();
  if (!source) return "";
  if (parsed.mode === "regex") return source.slice(0, 160);
  const lower = source.toLowerCase();
  for (const token of parsed.tokens) {
    const value = normalizeSearchText(token.value);
    if (!value) continue;
    const index = lower.indexOf(value);
    if (index >= 0) return snippetAround(source, index, value.length, 160, 24);
  }
  return source.slice(0, 160);
}
function promptRecencyTime(hit) {
  if (typeof hit.message.timestamp === "number" && Number.isFinite(hit.message.timestamp)) return hit.message.timestamp;
  return hit.result.modified.getTime();
}
function compareSessionSearchHitsRecent(a, b) {
  return promptRecencyTime(b) - promptRecencyTime(a) || b.result.modified.getTime() - a.result.modified.getTime() || b.message.index - a.message.index;
}
async function searchQolSessionHits(sessions, query, cwd, signal) {
  signal.throwIfAborted();
  const limit = Math.max(1, Math.floor(settingNumber("sessionSearch.resultLimit", DEFAULT_SESSION_SEARCH_LIMIT, cwd)));
  const parsed = parseSessionSearchQuery(query);
  if (parsed.error) throw new Error(parsed.error);
  const regexMatches = /* @__PURE__ */ new Map();
  if (parsed.mode === "regex" && parsed.regex) {
    const texts = [...new Set(sessions.flatMap((session) => [sessionTitleSearchText(session), ...userMessagesForResult(resultFromSession(session)).map((message2) => message2.text)]))];
    const matches = await sessionRegexMatches(parsed.regex.source, texts, signal);
    texts.forEach((text, index) => regexMatches.set(text, matches[index]));
  }
  const hits = [];
  let batchStarted = performance.now();
  for (const session of sessions) {
    signal.throwIfAborted();
    const messages = userMessagesForResult(resultFromSession(session));
    let addedPromptHit = false;
    for (const message2 of messages) {
      const match = matchTextSearch(message2.text, parsed, regexMatches);
      if (match.matches) {
        const snippet = buildPromptSnippet(message2, parsed, regexMatches.get(message2.text));
        hits.push({ message: message2, rank: match.score, result: resultFromSession(session, match.score, [snippet]), snippet });
        addedPromptHit = true;
      }
      if (performance.now() - batchStarted >= 4) {
        await yieldToInput(void 0, { signal });
        batchStarted = performance.now();
      }
    }
    if (!addedPromptHit) {
      const titleMatch = matchTextSearch(sessionTitleSearchText(session), parsed, regexMatches);
      const message2 = messages[messages.length - 1];
      if (titleMatch.matches && message2) {
        const snippet = buildPromptSnippet(message2, { mode: "tokens", tokens: [] });
        hits.push({ message: message2, rank: titleMatch.score, result: resultFromSession(session, titleMatch.score, [snippet]), snippet });
      }
    }
    if (hits.length > limit * 2) {
      hits.sort((a, b) => a.rank - b.rank || compareSessionSearchHitsRecent(a, b));
      hits.length = limit;
    }
  }
  signal.throwIfAborted();
  hits.sort((a, b) => a.rank - b.rank || compareSessionSearchHitsRecent(a, b));
  return hits.slice(0, limit);
}
function formatSessionSearchDate(date) {
  const diffMs = Math.max(0, Date.now() - date.getTime());
  const diffMins = Math.floor(diffMs / 6e4);
  const diffHours = Math.floor(diffMs / 36e5);
  const diffDays = Math.floor(diffMs / 864e5);
  if (diffMins < 1) return "now";
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

// src/extensions/qol/session-search/component.ts
function wrapVisible(text, width, maxLines) {
  const wrapped = wrapTextWithAnsi(text, width);
  if (wrapped.length <= maxLines) return wrapped;
  const head = wrapped.slice(0, Math.max(0, maxLines - 1));
  const tail = wrapped.slice(Math.max(0, maxLines - 1)).join(" ");
  return [...head, truncateToWidth6(tail, width, "\u2026")];
}
function styleSessionSnippet(snippet, query, _theme) {
  let styled = snippet;
  const parsed = parseSessionSearchQuery(query);
  if (parsed.mode === "tokens") {
    for (const token of parsed.tokens) {
      const value = token.value.trim();
      if (!value || value.length > 80) continue;
      try {
        styled = styled.replace(new RegExp(escapeRegex(value), "gi"), (match) => ansiRed(match));
      } catch {
      }
    }
  }
  return styled;
}
function boxParts(width, theme) {
  const safeWidth = Math.max(24, width);
  const paddingX = 2;
  const frameInner = Math.max(10, safeWidth - 2);
  const inner = Math.max(1, frameInner - paddingX * 2);
  const border = (s) => theme.fg("borderAccent", s);
  const fixed = (content = "", rowWidth = inner) => {
    const safeContent = content.replace(/[\r\n\t]+/g, " ");
    const clipped = truncateToWidth6(safeContent, rowWidth, "");
    return clipped + " ".repeat(Math.max(0, rowWidth - visibleWidth4(clipped)));
  };
  const row = (content = "", selected = false) => {
    const body = fixed(content);
    return `${border("\u2503")}${" ".repeat(paddingX)}${selected ? theme.bg("selectedBg", body) : body}${" ".repeat(paddingX)}${border("\u2503")}`;
  };
  const filledRow = (content = "", bg = "toolPendingBg") => {
    const body = fixed(content);
    return `${border("\u2503")}${" ".repeat(paddingX)}${theme.bg(bg, body)}${" ".repeat(paddingX)}${border("\u2503")}`;
  };
  const selectedRow = (content = "") => row(content, true);
  const empty = () => `${border("\u2503")}${" ".repeat(frameInner)}${border("\u2503")}`;
  const divider = () => row(theme.fg("borderMuted", "\u2501".repeat(inner)));
  const top = (label = "", right = "") => {
    if (!label) return border(`\u250F${"\u2501".repeat(frameInner)}\u2513`);
    const rightPlain = right ? ` ${right} ` : "";
    const titleBudget = Math.max(1, frameInner - visibleWidth4(rightPlain) - 1);
    const titlePlain = ` ${truncateToWidth6(label, Math.max(1, titleBudget - 2), "\u2026")} `;
    const fill = Math.max(1, frameInner - visibleWidth4(titlePlain) - visibleWidth4(rightPlain));
    const rightText = right ? theme.fg("dim", rightPlain) : "";
    return `${border("\u250F")}${ansiGreen(titlePlain)}${border("\u2501".repeat(fill))}${rightText}${border("\u2513")}`;
  };
  const bottom = () => border(`\u2517${"\u2501".repeat(frameInner)}\u251B`);
  return { bottom, divider, empty, filledRow, inner, row, selectedRow, top };
}
function isPrintableInput(data) {
  return data.length >= 1 && data.charCodeAt(0) >= 32 && !data.startsWith("\x1B") && data !== "\x7F";
}
var QolSessionSearchComponent = class {
  done;
  tui;
  theme;
  /** The index, while it loads, once loaded, or the load's failure. */
  sessions;
  cwd;
  currentModel;
  screen = "search";
  searchState;
  messagesState;
  actionState;
  actionReturnScreen = "messages";
  contextConfirmState;
  forkConfirmState;
  confirmModelState;
  indexController = new AbortController();
  queryController;
  debounceTimer;
  currentSessions = [];
  searchStatus = { status: "ready" };
  constructor(done, tui, theme, sessions, cwd, initialQuery = "", currentModel = void 0) {
    this.done = async (action) => {
      try {
        if (action.type === "copy" || action.type === "fork") {
          this.screen = "search";
          this.searchStatus = { status: "action" };
          this.tui.requestRender();
          action = { ...action, message: await sessionUserMessageForAction(action.result, action.message, this.indexController.signal) };
        }
        if (this.indexController.signal.aborted) return;
        this.dispose();
        done(action);
      } catch (error) {
        if (this.indexController.signal.aborted) return;
        this.searchStatus = { status: "failed", error: `${action.type === "copy" ? "Copy" : "Fork"} failed: ${String(error)}` };
        this.tui.requestRender();
      }
    };
    this.tui = tui;
    this.theme = theme;
    this.sessions = sessions;
    this.cwd = cwd;
    this.currentModel = currentModel;
    const query = initialQuery.trim();
    const scope = defaultSessionSearchScope(cwd);
    this.searchState = {
      cursor: query.length,
      query,
      results: [],
      selected: 0,
      scope,
      total: 0
    };
    if (sessions.status === "ready") this.setSessions(sessions);
  }
  invalidate() {
  }
  /** Pi disposes a completed custom overlay. Late loads cannot redraw it. */
  dispose() {
    this.indexController.abort();
    this.queryController?.abort();
    if (this.debounceTimer) clearTimeout(this.debounceTimer);
    this.debounceTimer = void 0;
    this.currentSessions = [];
    this.sessions = { status: "loading" };
    this.searchState.results = [];
  }
  /** Show the index once its load settles; the overlay opens before that. */
  setSessions(sessions) {
    const signal = this.indexController.signal;
    if (signal.aborted) return;
    if (sessions.status !== "ready") {
      this.sessions = sessions;
      this.tui.requestRender();
      return;
    }
    this.sessions = { status: "loading" };
    void Promise.all([
      prepareQolSessionSearchSessions(sessions.sessions, signal),
      canonicalPathForSessionSearch(this.cwd)
    ]).then(([prepared, cwd]) => {
      if (signal.aborted) return;
      this.sessions = { status: "ready", sessions: prepared };
      this.currentSessions = prepared.filter((session) => session.canonicalCwd === cwd);
      this.updateResults(false);
    }, (error) => {
      if (signal.aborted) return;
      this.sessions = { status: "failed", error: String(error) };
      this.tui.requestRender();
    });
  }
  maxOverlayRows() {
    const terminalRows = Number(this.tui.terminal?.rows ?? process.stdout.rows ?? 30);
    const safeRows = Number.isFinite(terminalRows) && terminalRows > 0 ? terminalRows : 30;
    return Math.max(9, Math.floor(safeRows * SESSION_SEARCH_OVERLAY_HEIGHT_RATIO));
  }
  compactSearchLayout() {
    return this.maxOverlayRows() < 18;
  }
  searchMaxVisibleRows() {
    const configured = Math.max(1, Math.floor(settingNumber("sessionSearch.maxVisible", 8, this.cwd)));
    const chromeRows = this.compactSearchLayout() ? 7 : 11;
    const responsive = Math.max(1, Math.floor((this.maxOverlayRows() - chromeRows) / 3));
    return Math.max(1, Math.min(configured, responsive));
  }
  messageMaxVisibleRows() {
    const configured = Math.max(1, Math.floor(settingNumber("sessionSearch.messageMaxVisible", 12, this.cwd)));
    const responsive = Math.max(1, this.maxOverlayRows() - 14);
    return Math.max(1, Math.min(configured, responsive));
  }
  forkConfirmMaxVisibleRows() {
    const configured = Math.max(1, Math.floor(settingNumber("sessionSearch.messageMaxVisible", 12, this.cwd)));
    const responsive = Math.max(1, this.maxOverlayRows() - 13);
    return Math.max(1, Math.min(configured, responsive));
  }
  render(width) {
    const configured = Math.max(70, Math.floor(settingNumber("sessionSearch.overlayWidth", 104, this.cwd)));
    const renderWidth = Math.min(Math.max(48, width), configured);
    if (this.screen === "messages" && this.messagesState) return this.renderMessages(renderWidth, this.messagesState);
    if (this.screen === "actions" && this.actionState) return this.renderActions(renderWidth, this.actionState);
    if (this.screen === "confirmContext" && this.contextConfirmState) return this.renderContextConfirm(renderWidth, this.contextConfirmState);
    if (this.screen === "confirmFork" && this.forkConfirmState) return this.renderForkConfirm(renderWidth, this.forkConfirmState);
    if (this.screen === "confirmModel" && this.confirmModelState) return this.renderConfirmModel(renderWidth, this.confirmModelState);
    return this.renderSearch(renderWidth);
  }
  handleInput(data) {
    if (this.searchStatus.status === "action") return matchesKey2(data, "escape") ? this.done({ type: "cancel" }) : void 0;
    if (this.screen === "messages" && this.messagesState) this.handleMessagesInput(data);
    else if (this.screen === "actions" && this.actionState) this.handleActionInput(data);
    else if (this.screen === "confirmContext" && this.contextConfirmState) this.handleContextConfirmInput(data);
    else if (this.screen === "confirmFork" && this.forkConfirmState) this.handleForkConfirmInput(data);
    else if (this.screen === "confirmModel" && this.confirmModelState) this.handleConfirmModelInput(data);
    else {
      this.screen = "search";
      this.handleSearchInput(data);
    }
    this.tui.requestRender();
  }
  clampSelection() {
    this.searchState.selected = Math.max(0, Math.min(this.searchState.selected, Math.max(0, this.searchState.results.length - 1)));
  }
  sessionsForScope(scope = this.searchState.scope) {
    if (this.sessions.status !== "ready") return [];
    if (scope === "all") return this.sessions.sessions;
    return this.currentSessions;
  }
  updateResults(resetSelection = true) {
    if (this.debounceTimer) clearTimeout(this.debounceTimer);
    this.debounceTimer = void 0;
    this.queryController?.abort();
    if (this.indexController.signal.aborted || this.sessions.status !== "ready") return;
    const controller = new AbortController();
    this.queryController = controller;
    const state = this.searchState;
    const scopedSessions = this.sessionsForScope(state.scope);
    state.results = [];
    this.searchStatus = { status: "searching" };
    state.total = scopedSessions.length;
    if (resetSelection) state.selected = 0;
    void searchQolSessionHits(scopedSessions, state.query, this.cwd, controller.signal).then((results) => {
      if (controller.signal.aborted || this.indexController.signal.aborted) return;
      state.results = results;
      this.searchStatus = { status: "ready" };
      this.clampSelection();
      this.tui.requestRender();
    }, (error) => {
      if (controller.signal.aborted || this.indexController.signal.aborted) return;
      this.searchStatus = { status: "failed", error: String(error) };
      this.tui.requestRender();
    });
  }
  toggleScope() {
    this.searchState.scope = this.searchState.scope === "current" ? "all" : "current";
    this.updateResults(true);
  }
  updateQuery(query, cursor) {
    this.searchState.query = query;
    this.searchState.cursor = Math.max(0, Math.min(cursor, query.length));
    this.queryController?.abort();
    this.searchState.results = [];
    this.searchStatus = { status: "searching" };
    if (this.debounceTimer) clearTimeout(this.debounceTimer);
    this.debounceTimer = setTimeout(() => this.updateResults(true), 20);
  }
  selectedMessageIndex(messages, query) {
    const trimmed = query.trim().toLowerCase();
    if (trimmed) {
      const firstToken = trimmed.replace(/^re:/, "").replace(/["']/g, "").split(/\s+/).find(Boolean);
      if (firstToken) {
        const found = messages.findIndex((message2) => message2.text.toLowerCase().includes(firstToken));
        if (found >= 0) return found;
      }
    }
    return Math.max(0, messages.length - 1);
  }
  openMessages(result, preferredMessage) {
    const messages = userMessagesForResult(result);
    const preferredIndex = preferredMessage ? messages.findIndex((message2) => message2.index === preferredMessage.index || message2.entryId && message2.entryId === preferredMessage.entryId) : -1;
    this.messagesState = {
      messages,
      result,
      selected: preferredIndex >= 0 ? preferredIndex : this.selectedMessageIndex(messages, this.searchState.query)
    };
    this.screen = "messages";
  }
  selectedFocusText(message2) {
    return `Focus on prompt #${message2.index}: ${message2.text}`;
  }
  openContextConfirm(type, result, message2, returnScreen) {
    this.contextConfirmState = { message: message2, result, returnScreen, type };
    this.screen = "confirmContext";
  }
  returnFromContextConfirm(state) {
    this.contextConfirmState = void 0;
    if (state.returnScreen === "actions" && this.actionState) this.screen = "actions";
    else if (state.returnScreen === "messages" && this.messagesState) this.screen = "messages";
    else this.screen = "search";
  }
  confirmContextAction(state) {
    this.done({ customPrompt: this.selectedFocusText(state.message), message: state.message, result: state.result, type: state.type });
  }
  openForkConfirm(result, message2, returnScreen) {
    const messages = userMessagesForResult(result);
    const preferredIndex = messages.findIndex((candidate) => candidate.index === message2.index || message2.entryId && candidate.entryId === message2.entryId);
    this.forkConfirmState = {
      messages,
      result,
      returnScreen,
      selected: preferredIndex >= 0 ? preferredIndex : 0
    };
    this.screen = "confirmFork";
  }
  returnFromForkConfirm(state) {
    this.forkConfirmState = void 0;
    if (state.returnScreen === "actions" && this.actionState) this.screen = "actions";
    else if (state.returnScreen === "messages" && this.messagesState) this.screen = "messages";
    else this.screen = "search";
  }
  confirmForkAction(state) {
    const message2 = state.messages[state.selected];
    if (!message2) return;
    this.done({ message: message2, result: state.result, type: "fork" });
  }
  startResume(result, returnScreen) {
    const previousModel = sessionModelInfo(result.path);
    const current = this.currentModel;
    if (previousModel && current && !sameModel(previousModel, current)) {
      this.confirmModelState = { result, returnScreen, selected: 0, previousModel, currentModel: current };
      this.screen = "confirmModel";
      return;
    }
    this.done({ result, type: "resume" });
  }
  returnFromConfirmModel(state) {
    this.confirmModelState = void 0;
    if (state.returnScreen === "actions" && this.actionState) this.screen = "actions";
    else if (state.returnScreen === "messages" && this.messagesState) this.screen = "messages";
    else this.screen = "search";
  }
  confirmModelAction(state) {
    this.done({ keepCurrentModel: state.selected === 1, result: state.result, type: "resume" });
  }
  returnFromActions() {
    this.actionState = void 0;
    if (this.actionReturnScreen === "messages" && this.messagesState) this.screen = "messages";
    else this.screen = "search";
  }
  handleSearchInput(data) {
    const state = this.searchState;
    if (matchesKey2(data, "escape")) {
      this.done({ type: "cancel" });
      return;
    }
    if (matchesKey2(data, "tab")) {
      this.toggleScope();
      return;
    }
    if (matchesKey2(data, "return") || matchesKey2(data, "enter")) {
      const hit = state.results[state.selected];
      if (!hit) return;
      this.openMessages(hit.result, hit.message);
      return;
    }
    if (matchesKey2(data, "alt+c")) {
      const hit = state.results[state.selected];
      if (hit) this.done({ message: hit.message, result: hit.result, type: "copy" });
      return;
    }
    if (matchesKey2(data, "alt+f")) {
      const hit = state.results[state.selected];
      if (hit) this.openForkConfirm(hit.result, hit.message, "search");
      return;
    }
    if (matchesKey2(data, "alt+r")) {
      const hit = state.results[state.selected];
      if (hit) this.startResume(hit.result, "search");
      return;
    }
    if (matchesKey2(data, "alt+i")) {
      const hit = state.results[state.selected];
      if (hit) this.openContextConfirm("summarize", hit.result, hit.message, "search");
      return;
    }
    if (matchesKey2(data, "alt+n")) {
      const hit = state.results[state.selected];
      if (hit) this.openContextConfirm("newSession", hit.result, hit.message, "search");
      return;
    }
    if (matchesKey2(data, "alt+a")) {
      const hit = state.results[state.selected];
      if (hit) {
        this.actionState = { message: hit.message, result: hit.result };
        this.actionReturnScreen = "search";
        this.screen = "actions";
      }
      return;
    }
    if (matchesKey2(data, "up")) {
      state.selected = Math.max(0, state.selected - 1);
      return;
    }
    if (matchesKey2(data, "down")) {
      state.selected = Math.min(Math.max(0, state.results.length - 1), state.selected + 1);
      return;
    }
    if (matchesKey2(data, "-") || matchesKey2(data, "pageup")) {
      state.selected = Math.max(0, state.selected - this.searchMaxVisibleRows());
      return;
    }
    if (matchesKey2(data, "=") || matchesKey2(data, "pagedown")) {
      state.selected = Math.min(Math.max(0, state.results.length - 1), state.selected + this.searchMaxVisibleRows());
      return;
    }
    if (matchesKey2(data, "left")) {
      state.cursor = Math.max(0, state.cursor - 1);
      return;
    }
    if (matchesKey2(data, "right")) {
      state.cursor = Math.min(state.query.length, state.cursor + 1);
      return;
    }
    if (matchesKey2(data, "home") || matchesKey2(data, "ctrl+a")) {
      state.cursor = 0;
      return;
    }
    if (matchesKey2(data, "end") || matchesKey2(data, "ctrl+e")) {
      state.cursor = state.query.length;
      return;
    }
    if (matchesKey2(data, "ctrl+u")) {
      this.updateQuery("", 0);
      return;
    }
    if (matchesKey2(data, "ctrl+w") || matchesKey2(data, "alt+backspace")) {
      const before = state.query.slice(0, state.cursor);
      const after = state.query.slice(state.cursor);
      let i = before.length;
      while (i > 0 && /\s/.test(before[i - 1])) i -= 1;
      while (i > 0 && !/\s/.test(before[i - 1])) i -= 1;
      this.updateQuery(`${before.slice(0, i)}${after}`, i);
      return;
    }
    if (matchesKey2(data, "backspace")) {
      if (state.cursor > 0) this.updateQuery(`${state.query.slice(0, state.cursor - 1)}${state.query.slice(state.cursor)}`, state.cursor - 1);
      return;
    }
    if (matchesKey2(data, "delete")) {
      if (state.cursor < state.query.length) this.updateQuery(`${state.query.slice(0, state.cursor)}${state.query.slice(state.cursor + 1)}`, state.cursor);
      return;
    }
    if (isPrintableInput(data)) this.updateQuery(`${state.query.slice(0, state.cursor)}${data}${state.query.slice(state.cursor)}`, state.cursor + data.length);
  }
  handleMessagesInput(data) {
    const state = this.messagesState;
    if (!state) return;
    if (matchesKey2(data, "escape") || matchesKey2(data, "backspace")) {
      this.screen = "search";
      return;
    }
    if (matchesKey2(data, "return") || matchesKey2(data, "enter")) {
      const message2 = state.messages[state.selected];
      if (!message2) return;
      this.actionState = { message: message2, result: state.result };
      this.actionReturnScreen = "messages";
      this.screen = "actions";
      return;
    }
    if (matchesKey2(data, "alt+r")) {
      this.startResume(state.result, "messages");
      return;
    }
    if (matchesKey2(data, "alt+c")) {
      const message2 = state.messages[state.selected];
      if (message2) this.done({ message: message2, result: state.result, type: "copy" });
      return;
    }
    if (matchesKey2(data, "alt+f")) {
      const message2 = state.messages[state.selected];
      if (message2) this.openForkConfirm(state.result, message2, "messages");
      return;
    }
    if (matchesKey2(data, "alt+i")) {
      const message2 = state.messages[state.selected];
      if (message2) this.openContextConfirm("summarize", state.result, message2, "messages");
      return;
    }
    if (matchesKey2(data, "alt+n")) {
      const message2 = state.messages[state.selected];
      if (message2) this.openContextConfirm("newSession", state.result, message2, "messages");
      return;
    }
    if (matchesKey2(data, "up")) {
      state.selected = Math.max(0, state.selected - 1);
      return;
    }
    if (matchesKey2(data, "down")) {
      state.selected = Math.min(state.messages.length - 1, state.selected + 1);
      return;
    }
    if (matchesKey2(data, "-") || matchesKey2(data, "pageup")) {
      state.selected = Math.max(0, state.selected - this.messageMaxVisibleRows());
      return;
    }
    if (matchesKey2(data, "=") || matchesKey2(data, "pagedown")) {
      state.selected = Math.min(state.messages.length - 1, state.selected + this.messageMaxVisibleRows());
      return;
    }
    if (matchesKey2(data, "home") || matchesKey2(data, "ctrl+a")) {
      state.selected = 0;
      return;
    }
    if (matchesKey2(data, "end") || matchesKey2(data, "ctrl+e")) {
      state.selected = Math.max(0, state.messages.length - 1);
    }
  }
  handleActionInput(data) {
    const state = this.actionState;
    if (!state) return;
    if (matchesKey2(data, "escape") || matchesKey2(data, "backspace")) {
      this.returnFromActions();
      return;
    }
    if (matchesKey2(data, "alt+c")) {
      this.done({ message: state.message, result: state.result, type: "copy" });
      return;
    }
    if (matchesKey2(data, "alt+f")) {
      this.openForkConfirm(state.result, state.message, "actions");
      return;
    }
    if (matchesKey2(data, "alt+r")) {
      this.startResume(state.result, "actions");
      return;
    }
    if (matchesKey2(data, "alt+i")) {
      this.openContextConfirm("summarize", state.result, state.message, "actions");
      return;
    }
    if (matchesKey2(data, "alt+n")) {
      this.openContextConfirm("newSession", state.result, state.message, "actions");
      return;
    }
  }
  handleContextConfirmInput(data) {
    const state = this.contextConfirmState;
    if (!state) return;
    if (matchesKey2(data, "escape") || matchesKey2(data, "backspace")) {
      this.returnFromContextConfirm(state);
      return;
    }
    if (matchesKey2(data, "return") || matchesKey2(data, "enter")) {
      this.confirmContextAction(state);
    }
  }
  handleConfirmModelInput(data) {
    const state = this.confirmModelState;
    if (!state) return;
    if (matchesKey2(data, "escape") || matchesKey2(data, "backspace")) {
      this.returnFromConfirmModel(state);
      return;
    }
    if (matchesKey2(data, "up") || matchesKey2(data, "down")) {
      state.selected = state.selected === 0 ? 1 : 0;
      return;
    }
    if (matchesKey2(data, "return") || matchesKey2(data, "enter")) {
      this.confirmModelAction(state);
    }
  }
  handleForkConfirmInput(data) {
    const state = this.forkConfirmState;
    if (!state) return;
    if (matchesKey2(data, "escape") || matchesKey2(data, "backspace")) {
      this.returnFromForkConfirm(state);
      return;
    }
    if (matchesKey2(data, "return") || matchesKey2(data, "enter")) {
      this.confirmForkAction(state);
      return;
    }
    if (matchesKey2(data, "up")) {
      state.selected = Math.max(0, state.selected - 1);
      return;
    }
    if (matchesKey2(data, "down")) {
      state.selected = Math.min(Math.max(0, state.messages.length - 1), state.selected + 1);
      return;
    }
    if (matchesKey2(data, "-") || matchesKey2(data, "pageup")) {
      state.selected = Math.max(0, state.selected - this.forkConfirmMaxVisibleRows());
      return;
    }
    if (matchesKey2(data, "=") || matchesKey2(data, "pagedown")) {
      state.selected = Math.min(Math.max(0, state.messages.length - 1), state.selected + this.forkConfirmMaxVisibleRows());
      return;
    }
    if (matchesKey2(data, "home") || matchesKey2(data, "ctrl+a")) {
      state.selected = 0;
      return;
    }
    if (matchesKey2(data, "end") || matchesKey2(data, "ctrl+e")) {
      state.selected = Math.max(0, state.messages.length - 1);
    }
  }
  renderSearch(width) {
    const { bottom, divider, empty, filledRow, inner, row, top } = boxParts(width, this.theme);
    const state = this.searchState;
    const compact = this.compactSearchLayout();
    const lines = [top("Session Search", `${state.results.length} hits`), empty()];
    const accent = (s) => this.theme.fg("accent", s);
    const dim = (s) => this.theme.fg("dim", s);
    const muted = (s) => this.theme.fg("muted", s);
    const cursorChar = state.query[state.cursor] ?? " ";
    const queryDisplay = `${state.query.slice(0, state.cursor)}${this.theme.inverse(cursorChar)}${state.query.slice(state.cursor + (state.cursor < state.query.length ? 1 : 0))}`;
    lines.push(row(this.renderScopeTabs(inner)));
    if (!compact) lines.push(empty());
    lines.push(filledRow(` > ${queryDisplay}`));
    if (!compact) lines.push(row(dim(`tokens \xB7 re:<pattern> regex \xB7 "phrase" exact`)));
    lines.push(divider());
    if (this.sessions.status === "loading") {
      lines.push(row(muted("Loading sessions\u2026")));
    } else if (this.sessions.status === "failed") {
      lines.push(row(muted(`Could not load sessions: ${this.sessions.error.split("\n")[0]}`)));
    } else if (this.searchStatus.status === "failed") {
      lines.push(row(muted(`Search failed: ${this.searchStatus.error.split("\n")[0]}`)));
    } else if (this.searchStatus.status === "searching" || this.searchStatus.status === "action") {
      lines.push(row(muted(this.searchStatus.status === "action" ? "Loading prompt\u2026  Esc cancel" : "Searching\u2026")));
    } else if (state.results.length === 0) {
      lines.push(row(muted(state.query.trim() ? "No prompts match your search" : "No prompts found")));
    } else {
      lines.push(...this.renderSearchHitPane(inner, row, dim, muted, accent));
    }
    lines.push(divider());
    if (compact) {
      lines.push(row(`${ansiYellow("alt+c/f/r/i/n/a")} ${dim("actions")}  ${ansiYellow("tab")} ${dim("scope")}`));
    } else {
      lines.push(row(`${ansiYellow("-/=")} ${dim("page")}  ${ansiYellow("alt+c")} ${dim("copy")}  ${ansiYellow("alt+f")} ${dim("fork")}  ${ansiYellow("alt+r")} ${dim("resume")}`));
      lines.push(row(`${ansiYellow("alt+i")} ${dim("inject+ctx")}  ${ansiYellow("alt+n")} ${dim("new+ctx")}  ${ansiYellow("alt+a")} ${dim("actions")}  ${ansiYellow("tab")} ${dim("scope")}`));
    }
    lines.push(bottom());
    return lines;
  }
  renderSearchHitPane(inner, row, dim, muted, accent) {
    const state = this.searchState;
    const compact = this.compactSearchLayout();
    const maxVisible = this.searchMaxVisibleRows();
    const start = Math.max(0, Math.min(state.selected - Math.floor(maxVisible / 2), state.results.length - maxVisible));
    const end = Math.min(start + maxVisible, state.results.length);
    const gap = ` ${dim("\u2502")} `;
    const twoPane = inner >= 72;
    const rightWidth = twoPane ? Math.max(24, Math.floor(inner * 0.43)) : 0;
    const leftWidth = twoPane ? Math.max(24, inner - rightWidth - visibleWidth4(gap)) : inner;
    const paneRows = Math.max(1, (end - start) * 3 - 1);
    const selectedHit = state.results[state.selected];
    const rightLines = twoPane ? this.renderPromptPreviewLines(selectedHit, rightWidth, paneRows, dim, muted, accent) : [];
    const fixed = (content, colWidth, selected = false) => {
      const safe = content.replace(/[\r\n\t]+/g, " ");
      const clipped = truncateToWidth6(safe, colWidth, "");
      const padded = clipped + " ".repeat(Math.max(0, colWidth - visibleWidth4(clipped)));
      return selected ? this.theme.bg("selectedBg", padded) : padded;
    };
    const leftLines = [];
    for (let i = start; i < end; i++) {
      const hit = state.results[i];
      const selected = i === state.selected;
      const promptDate = new Date(promptRecencyTime(hit));
      const metadata = dim(`#${hit.message.index} \xB7 ${formatSessionSearchDate(promptDate)}`);
      const titleText = truncateToWidth6(sessionResumeTitle(hit.result), Math.max(8, leftWidth - visibleWidth4(metadata) - 1), "\u2026");
      const title = accent(titleText);
      const snippet = styleSessionSnippet(hit.snippet || hit.message.text, state.query, this.theme);
      leftLines.push(fixed(selected ? this.theme.bold(snippet) : snippet, leftWidth, selected));
      leftLines.push(fixed(`${title} ${metadata}`, leftWidth, selected));
      if (i < end - 1) leftLines.push(fixed(dim("\u2500".repeat(Math.max(8, leftWidth))), leftWidth));
    }
    const output = [];
    for (let i = 0; i < leftLines.length; i++) {
      if (twoPane) output.push(row(`${leftLines[i] ?? ""}${gap}${rightLines[i] ?? " ".repeat(rightWidth)}`));
      else output.push(row(leftLines[i] ?? ""));
    }
    if (!twoPane && selectedHit) {
      output.push(row(dim("\u2500".repeat(Math.max(8, inner)))));
      for (const line of this.renderPromptPreviewLines(selectedHit, inner, Math.min(5, paneRows), dim, muted, accent)) output.push(row(line));
    }
    if (!compact && state.results.length > maxVisible) output.push(row(dim(`${state.selected + 1}/${state.results.length} ${state.query.trim() ? "matches" : "recent prompts"}`)));
    return output;
  }
  renderPromptPreviewLines(hit, width, maxLines, dim, muted, accent) {
    const fixed = (content) => {
      const clipped = truncateToWidth6(content.replace(/[\r\n\t]+/g, " "), width, "\u2026");
      return clipped + " ".repeat(Math.max(0, width - visibleWidth4(clipped)));
    };
    if (!hit) return Array.from({ length: maxLines }, () => fixed(""));
    const title = accent("Prompt preview");
    const cwd = muted(truncateToWidth6(shortPathForUi(hit.result.cwd || hit.result.path), width, "\u2026"));
    const bodyBudget = Math.max(1, maxLines - 3);
    const body = wrapVisible(styleSessionSnippet(hit.message.text, this.searchState.query, this.theme), width, bodyBudget);
    const lines = [fixed(title), fixed(cwd), fixed(dim("\u2500".repeat(Math.max(8, width)))), ...body.map(fixed)];
    while (lines.length < maxLines) lines.push(fixed(""));
    return lines.slice(0, maxLines);
  }
  renderScopeTabs(inner) {
    const tabs = [
      { id: "current", label: "Project" },
      { id: "all", label: "All" }
    ];
    const parts = tabs.map((tab) => {
      const label = ` ${truncateToWidth6(tab.label, 18, "\u2026")} `;
      if (tab.id === this.searchState.scope) return this.theme.fg("accent", this.theme.inverse(this.theme.bold(label)));
      return this.theme.bg("selectedBg", this.theme.fg("accent", label));
    });
    return truncateToWidth6(parts.join(" "), inner, "");
  }
  renderMessages(width, state) {
    const { bottom, divider, empty, inner, row, selectedRow, top } = boxParts(width, this.theme);
    const accent = (s) => this.theme.fg("accent", s);
    const dim = (s) => this.theme.fg("dim", s);
    const muted = (s) => this.theme.fg("muted", s);
    const result = state.result;
    const lines = [top("Session Prompts", `${state.selected + 1}/${state.messages.length}`), empty()];
    const pair = (left, right2) => {
      const leftWidth = Math.max(1, inner - visibleWidth4(right2) - 1);
      const clippedLeft = truncateToWidth6(left, leftWidth, "\u2026");
      const gap = Math.max(1, inner - visibleWidth4(clippedLeft) - visibleWidth4(right2));
      return `${clippedLeft}${" ".repeat(gap)}${right2}`;
    };
    const right = dim(formatSessionSearchDate(result.modified));
    const title = truncateToWidth6(sessionResumeTitle(result), Math.max(12, inner - visibleWidth4(right) - 1), "\u2026");
    lines.push(row(pair(this.theme.bold(accent(title)), right)));
    lines.push(row(muted(truncateToWidth6(shortPathForUi(result.cwd || result.path), inner, "\u2026"))));
    lines.push(empty(), divider(), empty());
    const maxVisible = this.messageMaxVisibleRows();
    const start = Math.max(0, Math.min(state.selected - Math.floor(maxVisible / 2), state.messages.length - maxVisible));
    const end = Math.min(start + maxVisible, state.messages.length);
    for (let i = start; i < end; i++) {
      const message2 = state.messages[i];
      const selected = i === state.selected;
      const numberPlain = `#${message2.index}`;
      const number = selected ? this.theme.fg("text", numberPlain) : dim(numberPlain);
      const textWidth = Math.max(12, inner - visibleWidth4(number) - 1);
      const text = truncateToWidth6(message2.text, textWidth, "\u2026");
      const messageRow = `${number} ${selected ? this.theme.bold(accent(text)) : text}`;
      lines.push(selected ? selectedRow(messageRow) : row(messageRow));
    }
    lines.push(divider(), empty());
    lines.push(row(`${ansiYellow("-/=")} ${dim("page")}  ${ansiYellow("alt+c")} ${dim("copy")}  ${ansiYellow("alt+f")} ${dim("fork")}  ${ansiYellow("alt+r")} ${dim("resume")}`));
    lines.push(row(`${ansiYellow("alt+i")} ${dim("inject+ctx")}  ${ansiYellow("alt+n")} ${dim("new+ctx")}`));
    lines.push(bottom());
    return lines;
  }
  renderActions(width, state) {
    const { bottom, divider, empty, inner, row, top } = boxParts(width, this.theme);
    const accent = (s) => this.theme.fg("accent", s);
    const dim = (s) => this.theme.fg("dim", s);
    const muted = (s) => this.theme.fg("muted", s);
    const lines = [top("Prompt Actions"), empty()];
    const title = truncateToWidth6(sessionResumeTitle(state.result), Math.max(12, inner - visibleWidth4(`#${state.message.index}`) - 2), "\u2026");
    lines.push(row(`${this.theme.bold(accent(title))}  ${dim(`#${state.message.index}`)}`));
    lines.push(row(muted(truncateToWidth6(shortPathForUi(state.result.cwd || state.result.path), inner, "\u2026"))));
    lines.push(empty(), divider(), empty());
    lines.push(row(dim("Selected prompt")));
    const wrapped = wrapVisible(state.message.text, inner, 4);
    for (const line of wrapped) lines.push(row(line));
    lines.push(empty(), divider(), empty());
    const helpLines = [
      "Fork session from here opens the source session at the point before this prompt and places the prompt in the editor; submit to branch from there.",
      "Copy Prompt copies this prompt into your current editor.",
      "Inject + Context summarizes the source session into the current session, focused on this prompt.",
      "New + Context creates a fresh session and imports that focused summary there."
    ];
    for (const help of helpLines) {
      for (const line of wrapVisible(dim(help), inner, 2)) lines.push(row(line));
    }
    lines.push(empty(), divider(), empty());
    lines.push(row(`${ansiYellow("alt+c")} ${dim("copy")}  ${ansiYellow("alt+f")} ${dim("fork")}  ${ansiYellow("alt+r")} ${dim("resume")}`));
    lines.push(row(`${ansiYellow("alt+i")} ${dim("inject+ctx")}  ${ansiYellow("alt+n")} ${dim("new+ctx")}`));
    lines.push(bottom());
    return lines;
  }
  renderConfirmModel(width, state) {
    const { bottom, divider, empty, inner, row, top } = boxParts(width, this.theme);
    const accent = (s) => this.theme.fg("accent", s);
    const dim = (s) => this.theme.fg("dim", s);
    const muted = (s) => this.theme.fg("muted", s);
    const warning = (s) => this.theme.fg("warning", s);
    const previousLabel = modelLabel2(state.previousModel);
    const currentLabel = modelLabel2(state.currentModel);
    const lines = [top("Choose model"), empty()];
    const title = truncateToWidth6(sessionResumeTitle(state.result), inner, "\u2026");
    lines.push(row(this.theme.bold(warning("Model differs from current session"))));
    lines.push(row(accent(`\u201C${title}\u201D`)));
    lines.push(row(muted(truncateToWidth6(shortPathForUi(state.result.cwd || state.result.path), inner, "\u2026"))));
    lines.push(empty());
    lines.push(row(`${dim("Session model: ")}${warning(previousLabel)}`));
    lines.push(row(`${dim("Current model: ")}${warning(currentLabel)}`));
    lines.push(empty());
    for (const help of [
      "Previous model resumes exactly as saved.",
      "Current model writes a model-change event before resume, so full context transfers and future turns use it."
    ]) {
      for (const line of wrapVisible(dim(help), inner, 2)) lines.push(row(line));
    }
    lines.push(empty(), divider(), empty());
    const optionRow = (index, label, model) => {
      const selected = state.selected === index;
      const prefix = selected ? "\u203A " : "  ";
      const content = `${warning(prefix)}${selected ? this.theme.fg("text", label) : dim(label)}${dim(" \u2014 ")}${selected ? warning(model) : muted(model)}`;
      const body = truncateToWidth6(content, inner, "\u2026") + " ".repeat(Math.max(0, inner - visibleWidth4(truncateToWidth6(content, inner, "\u2026"))));
      return selected ? this.theme.bg("selectedBg", body) : body;
    };
    lines.push(row(optionRow(0, "Continue with previous model", previousLabel)));
    lines.push(row(optionRow(1, "Continue with current model", currentLabel)));
    lines.push(empty(), divider(), empty());
    lines.push(row(`${ansiYellow("\u2191/\u2193")} ${dim("choose")}  ${ansiYellow("enter")} ${dim("resume")}  ${ansiYellow("backspace")} ${dim("back")}`));
    lines.push(bottom());
    return lines;
  }
  renderForkConfirm(width, state) {
    const { bottom, divider, empty, inner, row, selectedRow, top } = boxParts(width, this.theme);
    const accent = (s) => this.theme.fg("accent", s);
    const dim = (s) => this.theme.fg("dim", s);
    const muted = (s) => this.theme.fg("muted", s);
    const lines = [top("Fork Session", `${state.selected + 1}/${state.messages.length}`), empty()];
    const title = truncateToWidth6(sessionResumeTitle(state.result), inner, "\u2026");
    lines.push(row(this.theme.bold(accent(title))));
    lines.push(row(muted(truncateToWidth6(shortPathForUi(state.result.cwd || state.result.path), inner, "\u2026"))));
    lines.push(empty(), divider(), empty());
    for (const line of wrapVisible(dim("Choose the prompt to fork from. Pi will open the source session before that prompt and place the prompt in the editor."), inner, 2)) {
      lines.push(row(line));
    }
    lines.push(empty());
    const maxVisible = this.forkConfirmMaxVisibleRows();
    const start = Math.max(0, Math.min(state.selected - Math.floor(maxVisible / 2), state.messages.length - maxVisible));
    const end = Math.min(start + maxVisible, state.messages.length);
    for (let i = start; i < end; i++) {
      const message2 = state.messages[i];
      const selected = i === state.selected;
      const numberPlain = `#${message2.index}`;
      const number = selected ? this.theme.fg("text", numberPlain) : dim(numberPlain);
      const textWidth = Math.max(12, inner - visibleWidth4(number) - 1);
      const text = truncateToWidth6(message2.text, textWidth, "\u2026");
      const messageRow = `${number} ${selected ? this.theme.bold(accent(text)) : text}`;
      lines.push(selected ? selectedRow(messageRow) : row(messageRow));
    }
    if (state.messages.length > maxVisible) lines.push(row(dim(`${state.selected + 1}/${state.messages.length} prompts`)));
    lines.push(divider(), empty());
    lines.push(row(`${ansiYellow("backspace")} ${dim("back")}`));
    lines.push(bottom());
    return lines;
  }
  renderContextConfirm(width, state) {
    const { bottom, divider, empty, inner, row, top } = boxParts(width, this.theme);
    const accent = (s) => this.theme.fg("accent", s);
    const dim = (s) => this.theme.fg("dim", s);
    const muted = (s) => this.theme.fg("muted", s);
    const action = state.type === "newSession" ? "New + Context" : "Inject + Context";
    const verb = state.type === "newSession" ? "create new session with context" : "inject context";
    const lines = [top(action), empty()];
    lines.push(row(`${accent(sessionResumeTitle(state.result))}  ${dim(`#${state.message.index}`)}`));
    lines.push(row(muted(truncateToWidth6(shortPathForUi(state.result.cwd || state.result.path), inner, "\u2026"))));
    lines.push(empty(), divider(), empty());
    const details = [
      "This summarizes the entire source session, including messages after this prompt.",
      "The selected prompt is used as the focus for the summary, not as a cutoff point.",
      state.type === "newSession" ? "New + Context creates a fresh session and imports that focused summary there." : "Inject + Context adds that focused summary to your current session."
    ];
    for (const detail of details) {
      for (const line of wrapVisible(dim(detail), inner, 2)) lines.push(row(line));
    }
    lines.push(empty(), divider(), empty());
    lines.push(row(`${ansiYellow("backspace")} ${dim("back")}`));
    lines.push(bottom());
    return lines;
  }
};
var QolSessionSearchLoadingComponent = class {
  tui;
  theme;
  title;
  message;
  done;
  controller = new AbortController();
  startedAt = Date.now();
  frame = 0;
  timer;
  constructor(tui, theme, title, message2, done) {
    this.tui = tui;
    this.theme = theme;
    this.title = title;
    this.message = message2;
    this.done = done;
    this.timer = setInterval(() => {
      this.frame += 1;
      this.tui.requestRender();
    }, 180);
    this.timer.unref?.();
  }
  get signal() {
    return this.controller.signal;
  }
  dispose() {
    if (this.timer) clearInterval(this.timer);
    this.timer = void 0;
  }
  invalidate() {
  }
  handleInput(data) {
    if (!matchesKey2(data, "escape") && !matchesKey2(data, "ctrl+c")) return;
    if (!this.controller.signal.aborted) this.controller.abort();
    this.dispose();
    this.done(null);
  }
  render(width) {
    const { bottom, divider, empty, row, top } = boxParts(width, this.theme);
    const dim = (s) => this.theme.fg("dim", s);
    const muted = (s) => this.theme.fg("muted", s);
    const accent = (s) => this.theme.fg("accent", s);
    const frames = ["|", "/", "-", "\\"];
    const elapsed = `${Math.max(0, Math.floor((Date.now() - this.startedAt) / 1e3))}s`;
    const indicator = accent(frames[this.frame % frames.length]);
    return [
      top(this.title, elapsed),
      empty(),
      row(`${indicator} ${muted(this.message)}`),
      row(dim("Long sessions may take a few seconds to summarize.")),
      empty(),
      divider(),
      empty(),
      bottom()
    ];
  }
};

// src/extensions/qol/session-search/context.ts
import { SessionManager as SessionManager2 } from "@earendil-works/pi-coding-agent";
import { Text as Text2 } from "@earendil-works/pi-tui";
function trimSessionSummaryInput(text, cwd) {
  const maxChars = Math.max(2e4, Math.floor(settingNumber("sessionSearch.summaryInputMaxChars", DEFAULT_SESSION_SEARCH_SUMMARY_INPUT_CHARS, cwd)));
  if (text.length <= maxChars) return text;
  const headChars = Math.floor(maxChars * 0.35);
  const tailChars = maxChars - headChars;
  const omitted = text.length - maxChars;
  return `${text.slice(0, headChars)}

[... ${omitted.toLocaleString()} character(s) omitted from the middle of this imported session ...]

${text.slice(-tailChars)}`;
}
function messagesForSessionSummary(sessionPath) {
  try {
    const manager = SessionManager2.open(sessionPath);
    const context = manager.buildSessionContext();
    if (Array.isArray(context.messages) && context.messages.length > 0) return context.messages;
  } catch {
  }
  try {
    const messages = [];
    forEachSessionJsonlLine(sessionPath, (line) => {
      if (!line.trim()) return;
      let entry;
      try {
        entry = JSON.parse(line);
      } catch {
        return;
      }
      if (entry?.type === "message" && entry.message) messages.push(entry.message);
    });
    return messages;
  } catch {
    return [];
  }
}
async function buildSessionSearchContextMessage(ctx, result, customPrompt, signal) {
  const messages = messagesForSessionSummary(result.path);
  const fallbackText = result.allMessagesText || result.firstMessage;
  const conversationText = messages.length > 0 ? serializeMessagesForSummary(messages) : fallbackText;
  if (!conversationText.trim()) throw new Error("Selected session has no text content to summarize");
  const focus = customPrompt?.trim();
  const summary = await generateQolSummary(ctx, {
    conversationText: trimSessionSummaryInput(conversationText, ctx.cwd),
    maxTokens: Math.max(256, Math.floor(settingNumber("sessionSearch.summaryMaxTokens", DEFAULT_SESSION_SEARCH_SUMMARY_MAX_TOKENS, ctx.cwd))),
    model: settingString("sessionSearch.summaryModel", "current", ctx.cwd),
    customInstructions: [
      `Source session file: ${result.path}`,
      `Source project/cwd: ${result.cwd || sessionDisplayName(result)}`,
      focus ? `User focus: ${focus}` : "Focus on facts needed to continue or reference this previous session."
    ].join("\n"),
    purpose: "session-search",
    signal: signal ?? ctx.signal
  });
  const title = sessionDisplayName(result);
  const content = [
    `## Session Search Context: ${title}`,
    `**Date:** ${result.modified.toISOString()} | **File:** ${result.path}`,
    focus ? `**Focus:** ${focus}` : void 0,
    "",
    summary.summary
  ].filter((line) => line !== void 0).join("\n");
  return {
    content,
    details: {
      file: result.path,
      focus,
      model: summary.model,
      project: result.cwd || title,
      source: "pi-qol-session-search",
      via: summary.via
    }
  };
}
async function buildSessionSearchContextMessageWithLoader(ctx, result, customPrompt, actionLabel) {
  const title = sessionDisplayName(result);
  if (!ctx.hasUI) return buildSessionSearchContextMessage(ctx, result, customPrompt);
  ctx.ui.setStatus(SESSION_SEARCH_STATUS_KEY, `Summarizing ${title}...`);
  const releaseModalLock = acquirekendexModalLock();
  let failure;
  try {
    const message2 = await ctx.ui.custom((tui, theme, _kb, done) => {
      let closed = false;
      const loader = new QolSessionSearchLoadingComponent(tui, theme, actionLabel, "Summarizing session context...", (value) => {
        if (closed) return;
        closed = true;
        done(value);
      });
      const finish = (value) => {
        if (closed) return;
        closed = true;
        loader.dispose();
        done(value);
      };
      buildSessionSearchContextMessage(ctx, result, customPrompt, loader.signal).then(finish).catch((error) => {
        if (!loader.signal?.aborted) failure = error;
        finish(null);
      });
      return loader;
    }, {
      overlay: true,
      overlayOptions: {
        anchor: "center",
        width: Math.max(56, Math.min(92, Math.floor(settingNumber("sessionSearch.overlayWidth", 104, ctx.cwd) * 0.75))),
        maxHeight: "70%"
      }
    });
    if (failure) throw failure;
    if (!message2) throw new Error("Session context summary cancelled");
    return message2;
  } finally {
    releaseModalLock();
    ctx.ui.setStatus(SESSION_SEARCH_STATUS_KEY, void 0);
  }
}
async function injectSessionSearchContext(pi, ctx, result, customPrompt) {
  const title = sessionDisplayName(result);
  const message2 = await buildSessionSearchContextMessageWithLoader(ctx, result, customPrompt, "Inject + Context");
  pi.sendMessage({ customType: SESSION_SEARCH_CONTEXT_TYPE, content: message2.content, details: message2.details, display: true }, { deliverAs: "followUp", triggerTurn: false });
  ctx.ui.notify(`Session context injected: ${title}`, "info");
}
function renderSessionSearchContextMessage(message2, options, theme) {
  const raw = typeof message2.content === "string" ? message2.content : Array.isArray(message2.content) ? message2.content.map((part) => part?.type === "text" ? part.text ?? "" : "").join("") : "";
  const title = raw.match(/^## Session Search Context:\s*(.+)$/m)?.[1]?.trim() || "session";
  const date = raw.match(/\*\*Date:\*\*\s*([^|\n]+)/)?.[1]?.trim() || "";
  const header = `${theme.fg("customMessageLabel", theme.bold("Session context: "))}${theme.fg("accent", title)}${date ? theme.fg("muted", ` (${date})`) : ""}`;
  if (!options?.expanded) return new Text2(`${header}${theme.fg("dim", "  ctrl+o to expand")}`, 0, 0);
  const body = raw.slice(raw.indexOf("\n") + 1).trim();
  return new Text2(body ? `${header}

${body}` : header, 0, 0);
}

// src/extensions/qol/session-search/index.ts
function asCommandContext(ctx) {
  return ctx;
}
function queueSessionSearchCommandAction(ctx, action) {
  const id = queueSessionSearchPendingAction(action);
  ctx.ui.setEditorText(`/search:resume-pending ${id}`);
  ctx.ui.notify(`${sessionDisplayName(action.result)} \u2014 press enter to ${action.type === "fork" ? "fork" : "resume"}`, "info");
}
async function runSessionSearchResumeOrFork(pi, ctx, action) {
  if (!action.result || action.type !== "resume" && action.type !== "fork") return true;
  const commandCtx = asCommandContext(ctx);
  if (typeof commandCtx.switchSession !== "function") return false;
  const targetTitle = sessionDisplayName(action.result);
  const currentModel = action.keepCurrentModel ? ctx.model : void 0;
  const currentThinking = action.keepCurrentModel && typeof pi.getThinkingLevel === "function" ? pi.getThinkingLevel() : void 0;
  let replacementStarted = false;
  try {
    const selectedMessage = action.type === "fork" ? action.message : void 0;
    if (currentModel) pinSessionModel(action.result.path, currentModel, currentThinking);
    const result = await commandCtx.switchSession(action.result.path, {
      withSession: async (replacementCtx) => {
        replacementStarted = true;
        if (currentModel) replacementCtx.ui.notify(`Using current model: ${currentModel.provider}/${currentModel.id}`, "info");
        if (selectedMessage) {
          const manager = replacementCtx.sessionManager;
          if (selectedMessage.entryId && selectedMessage.parentId && typeof manager?.branch === "function") manager.branch(selectedMessage.parentId);
          else if (selectedMessage.entryId && selectedMessage.parentId === null && typeof manager?.resetLeaf === "function") manager.resetLeaf();
          replacementCtx.ui.setEditorText(selectedMessage.text);
          const timer = setTimeout(() => {
            replacementCtx.ui.notify(`Forked session: ${targetTitle} at prompt #${selectedMessage.index}. Submit to branch from here.`, "info");
          }, 0);
          timer.unref?.();
          return;
        }
        replacementCtx.ui.notify(`Resumed session: ${targetTitle}${currentModel ? " with current model" : ""}`, "info");
      }
    });
    if (result.cancelled) ctx.ui.notify(selectedMessage ? "Fork cancelled" : "Resume cancelled", "info");
  } catch (error) {
    if (!replacementStarted) ctx.ui.notify(`${action.type === "fork" ? "Fork" : "Resume"} failed: ${stringifyError(error)}`, "error");
  }
  return true;
}
async function createNewSessionWithSearchContext(pi, ctx, result, customPrompt) {
  const title = sessionDisplayName(result);
  const message2 = await buildSessionSearchContextMessageWithLoader(ctx, result, customPrompt, "New + Context");
  const commandCtx = asCommandContext(ctx);
  if (typeof commandCtx.newSession === "function") {
    const parentSession = ctx.sessionManager.getSessionFile?.();
    let replacementStarted = false;
    try {
      const switchResult = await commandCtx.newSession({
        parentSession,
        withSession: async (replacementCtx) => {
          replacementStarted = true;
          try {
            if (typeof replacementCtx.sendMessage === "function") {
              await replacementCtx.sendMessage({ customType: SESSION_SEARCH_CONTEXT_TYPE, content: message2.content, details: message2.details, display: true }, { triggerTurn: false });
            }
            replacementCtx.ui.notify(`New session has context from ${title}`, "info");
          } catch (error) {
            replacementCtx.ui.notify(`New session context import failed: ${stringifyError(error)}`, "error");
          }
        }
      });
      if (switchResult.cancelled) ctx.ui.notify("New session cancelled", "info");
    } catch (error) {
      if (!replacementStarted) throw error;
    }
    return;
  }
  setPendingSessionSearchMessage(message2);
  ctx.ui.setEditorText("/new");
  ctx.ui.notify(`${title} \u2014 press enter to create a new session with this context`, "info");
}
async function consumePendingSessionSearchContext(pi, ctx, reason) {
  if (reason !== "new") return;
  const pending = getPendingSessionSearchMessage();
  if (!pending) return;
  setPendingSessionSearchMessage(void 0);
  pi.sendMessage({ customType: SESSION_SEARCH_CONTEXT_TYPE, content: pending.content, details: pending.details, display: true }, { triggerTurn: false });
  if (ctx.hasUI) ctx.ui.notify("Imported session-search context.", "info");
}
async function openQolSessionSearch(pi, ctx, initialQuery = "") {
  if (!ctx.hasUI) {
    ctx.ui.notify("Session search requires interactive UI", "warning");
    return;
  }
  const loading = refreshQolSessionSearchCache(ctx).then(
    (sessions) => ({ status: "ready", sessions }),
    (error) => ({ status: "failed", error: stringifyError(error) })
  );
  const releaseModalLock = acquirekendexModalLock();
  let action;
  let component;
  try {
    const currentModel = ctx.model ? { provider: ctx.model.provider, id: ctx.model.id } : void 0;
    action = await ctx.ui.custom((tui, theme, _keybindings, done) => {
      component = new QolSessionSearchComponent((selected) => {
        if (selected.type === "copy") {
          ctx.ui.setEditorText(selected.message.text);
          ctx.ui.notify("Copied selected prompt into the editor", "info");
        }
        done(selected);
      }, tui, theme, { status: "loading" }, ctx.cwd, initialQuery, currentModel);
      void loading.then((load) => component?.setSessions(load));
      return component;
    }, {
      overlay: true,
      overlayOptions: {
        anchor: "center",
        width: Math.max(70, Math.floor(settingNumber("sessionSearch.overlayWidth", 104, ctx.cwd))),
        maxHeight: "90%"
      }
    });
  } finally {
    component?.dispose();
    releaseModalLock();
  }
  if (!action || action.type === "cancel" || !action.result) return;
  if (action.type === "resume" || action.type === "fork") {
    if (!await runSessionSearchResumeOrFork(pi, ctx, action)) queueSessionSearchCommandAction(ctx, action);
    return;
  }
  if (action.type === "summarize") {
    try {
      await injectSessionSearchContext(pi, ctx, action.result, action.customPrompt);
    } catch (error) {
      const message2 = stringifyError(error);
      ctx.ui.notify(/cancelled/i.test(message2) ? "Inject + Context cancelled" : `Inject + Context failed: ${message2}`, /cancelled/i.test(message2) ? "info" : "error");
      ctx.ui.setStatus(SESSION_SEARCH_STATUS_KEY, void 0);
    }
    return;
  }
  if (action.type === "newSession") {
    try {
      await createNewSessionWithSearchContext(pi, ctx, action.result, action.customPrompt);
    } catch (error) {
      const message2 = stringifyError(error);
      ctx.ui.notify(/cancelled/i.test(message2) ? "New + Context cancelled" : `New + Context failed: ${message2}`, /cancelled/i.test(message2) ? "info" : "error");
      ctx.ui.setStatus(SESSION_SEARCH_STATUS_KEY, void 0);
    }
  }
}

// src/extensions/qol/status-message.ts
function autoCompactionStatus(gate, enabled) {
  switch (gate) {
    case "enabled":
      return enabled();
    case "disabled":
      return "disabled";
    case "pi-compaction-disabled":
      return "disabled by Pi compaction.enabled=false";
    default: {
      const unknownGate = gate;
      throw new Error(`pi-qol: unknown auto-compaction gate ${String(unknownGate)}`);
    }
  }
}
function statusMessage(ctx) {
  const labels = attachmentLabels(currentEditorText(ctx), ctx.cwd);
  const searchShortcut = sessionSearchShortcut(ctx.cwd);
  const statuslineEnabled = settingBoolean("statusline.enabled", true, ctx.cwd);
  const nativeBlocked = gatewayPrivacyBlocksNativeSummary(ctx);
  const statuslineMode = statuslineEnabled ? settingBoolean("replaceFooter", true, ctx.cwd) ? "enabled, replaces footer" : "enabled, footer preserved" : "disabled";
  return [
    "Pi QOL status",
    `Statusline: ${statuslineMode}; prompt=${settingBoolean("compactPrompt", true, ctx.cwd) ? `${glyphs(ctx.cwd).prompt} compact` : "default chrome"}`,
    `shift+enter newline: ${settingBoolean("newlineOnShiftEnter", true, ctx.cwd) ? "enabled" : "disabled"}`,
    `Fallback newline key: ${newlineFallbackKey(ctx.cwd)}`,
    `Pending queue preview: ${settingBoolean("pendingQueue.asciiGreen", true, ctx.cwd) ? "ANSI green" : "Pi default"}`,
    `Image chips: ${settingBoolean("showImageChips", true, ctx.cwd) ? "filled (placeholders and existing image paths)" : "off"}`,
    `Image placeholders/paths in draft: ${labels.length ? labels.join(", ") : "none"}`,
    `Rename command: ${settingBoolean("enableSessionNameCommand", true, ctx.cwd) ? "enabled (/rename)" : "disabled"}`,
    `Auto session rename: ${autoRenameEnabled(ctx.cwd) ? `enabled (${settingString("sessionAutoRename.model", DEFAULT_AUTO_RENAME_MODEL, ctx.cwd)})` : "disabled"}`,
    `Handoff command: ${settingBoolean("enableHandoffCommand", true, ctx.cwd) ? "enabled" : "disabled"}`,
    `Schedule command: ${settingBoolean("enableScheduleCommand", true, ctx.cwd) ? "enabled (/schedule)" : "disabled"}`,
    `Handoff prompt review: ${settingBoolean("handoffReviewPrompt", true, ctx.cwd) ? "enabled" : "disabled"}`,
    `Session search: ${settingBoolean("sessionSearch.enabled", true, ctx.cwd) ? `enabled (/search${searchShortcut ? `, ${searchShortcut}` : ""})` : "disabled"}`,
    `Custom compaction: ${settingBoolean("compaction.customEnabled", false, ctx.cwd) ? `enabled (${settingString("compaction.model", DEFAULT_COMPACTION_MODEL, ctx.cwd)}, ${compactionProfile(ctx.cwd)})` : nativeBlocked ? "enabled by gateway privacy" : "disabled (Pi default)"}`,
    `Budget guard: ${autoCompactionStatus(autoCompactionGate("budgetGuard", ctx.cwd), () => `enabled (budgetPercent=${settingNumber("compaction.budgetPercent", DEFAULT_BUDGET_GUARD_PERCENT, ctx.cwd)}, budgetTokens=${settingNumber("compaction.budgetTokens", DEFAULT_BUDGET_GUARD_TOKENS, ctx.cwd)})`)}`,
    `Idle compaction: ${autoCompactionStatus(autoCompactionGate("idle", ctx.cwd), () => `enabled after ${Math.max(1, Math.floor(settingNumber("compaction.idleTimeoutSeconds", DEFAULT_IDLE_COMPACTION_SECONDS, ctx.cwd)))}s idle`)}`,
    `Branch summary override: ${settingBoolean("compaction.branchSummaryEnabled", false, ctx.cwd) ? "enabled" : nativeBlocked ? "enabled by gateway privacy" : "disabled"}`,
    `Notifications: ${settingBoolean("notification.enabled", true, ctx.cwd) ? `enabled (bell=${settingBoolean("notification.bell", true, ctx.cwd)}, muteBell=${settingBoolean("notification.muteBellSound", false, ctx.cwd)}, native=${settingBoolean("notification.native", true, ctx.cwd)}, tmuxClientTty=${settingBoolean("notification.tmuxNativeClientTty", true, ctx.cwd)}, tmuxMessage=${settingBoolean("notification.tmux", false, ctx.cwd)})` : "disabled"}`,
    `Permission gate: ${settingBoolean("permissionGate.enabled", false, ctx.cwd) ? `enabled (${permissionGateCommands(ctx.cwd).join(", ") || "none configured"}; preview ${boundedSettingNumber("permissionGate.previewLines", DEFAULT_PERMISSION_GATE_PREVIEW_LINES, 4, 40, ctx.cwd)} lines/${boundedSettingNumber("permissionGate.previewChars", DEFAULT_PERMISSION_GATE_PREVIEW_CHARS, 200, 5e3, ctx.cwd)} chars)` : "disabled"}`,
    `Thinking timer: ${settingBoolean("thinkingTimer.enabled", true, ctx.cwd) ? "enabled" : "disabled"}`,
    "If shift+enter still submits, configure your terminal/tmux to send a distinct shift+enter sequence or use the fallback key."
  ].join("\n");
}

// src/extensions/qol/statusline.ts
import { execFile as execFile2 } from "node:child_process";
import { basename as basename4 } from "node:path";
import { truncateToWidth as truncateToWidth8, visibleWidth as visibleWidth5 } from "@earendil-works/pi-tui";

// src/extensions/qol/agent-statusline.ts
import { truncateToWidth as truncateToWidth7 } from "@earendil-works/pi-tui";
var AGENT_ASCII_COLOR_SEQUENCE = ["magenta", "green", "blue", "cyan", "yellow", "red"];
var AGENT_ASCII_BG = {
  red: 41,
  green: 42,
  yellow: 43,
  blue: 44,
  magenta: 45,
  cyan: 46
};
function normalizeAgentAsciiColor(value) {
  const normalized = value?.trim().toLowerCase().replace(/[^a-z]/g, "");
  switch (normalized) {
    case "red":
      return "red";
    case "green":
      return "green";
    case "yellow":
    case "orange":
      return "yellow";
    case "blue":
      return "blue";
    case "magenta":
    case "purple":
    case "violet":
      return "magenta";
    case "cyan":
    case "teal":
      return "cyan";
    default:
      return void 0;
  }
}
function fallbackAgentAsciiColor(name) {
  let hash = 0;
  for (const char of name) hash = hash * 31 + char.charCodeAt(0) >>> 0;
  return AGENT_ASCII_COLOR_SEQUENCE[hash % AGENT_ASCII_COLOR_SEQUENCE.length] ?? "magenta";
}
function ansiAgentBg(color, text) {
  return `\x1B[30;${AGENT_ASCII_BG[color]}m${text}\x1B[39;49m`;
}
function subagentStatuslineMarker(cwd, maxInnerWidth = 24) {
  const bridgeInfo = readPiAgentsStatuslineBridge()?.getCurrentSubagent(cwd);
  const envName = process.env.PI_SUBAGENT_CHILD_AGENT?.trim();
  const rawName = bridgeInfo?.name?.trim() || envName;
  if (!rawName) return void 0;
  const color = normalizeAgentAsciiColor(bridgeInfo?.color) ?? normalizeAgentAsciiColor(process.env.PI_SUBAGENT_CHILD_COLOR) ?? fallbackAgentAsciiColor(rawName);
  const inner = truncateToWidth7(rawName, Math.max(1, maxInnerWidth), "\u2026");
  const plain = ` ${inner} `;
  return { plain, styled: ansiAgentBg(color, plain) };
}

// src/extensions/qol/statusline.ts
function repoNameFromRemote(remote) {
  const trimmed = remote.trim().replace(/\.git$/, "");
  const match = trimmed.match(/([^/:]+)$/);
  return match?.[1];
}
function formatModelName(ctx) {
  const model = ctx.model;
  if (!model) return "no model";
  let name = model.name || model.id;
  name = name.replace(/^Claude\s+/i, "");
  name = name.replace(/^claude[-_]/i, "");
  name = name.replace(/[-_](20\d{6}|latest)$/i, "");
  name = name.replace(/^gpt[-_]/i, "GPT ");
  name = name.replace(/[-_]/g, " ");
  name = name.replace(/\bopus\b/i, "Opus");
  name = name.replace(/\bsonnet\b/i, "Sonnet");
  name = name.replace(/\bhaiku\b/i, "Haiku");
  name = name.replace(/\s+/g, " ").trim();
  name = name.replace(/\b(Opus|Sonnet|Haiku) (\d) (\d)\b/, "$1 $2.$3");
  return name;
}
var PROVIDER_NAMES = {
  "github-copilot": "Copilot",
  "openai": "OpenAI",
  "openai-codex": "Codex",
  "anthropic": "Anthropic",
  "pi-claude": "Claude",
  "google": "Google",
  "google-gemini-cli": "Gemini CLI",
  "google-antigravity": "Antigravity",
  "google-vertex": "Vertex AI",
  "amazon-bedrock": "Bedrock",
  "azure-openai-responses": "Azure OpenAI",
  "openrouter": "OpenRouter",
  "vercel-ai-gateway": "Vercel AI Gateway",
  "xai": "xAI",
  "groq": "Groq",
  "cerebras": "Cerebras",
  "mistral": "Mistral",
  "deepseek": "DeepSeek",
  "zai": "Z.AI",
  "ollama": "Ollama"
};
function formatProviderName(provider) {
  const name = stripAnsi(provider).replace(/[\x00-\x1f\x7f]/g, " ").trim();
  return Object.hasOwn(PROVIDER_NAMES, name) ? PROVIDER_NAMES[name] : name.replace(/[-_]+/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase()).replace(/\s+/g, " ").trim();
}
var THINKING_TOKEN = {
  off: "thinkingOff",
  minimal: "thinkingMinimal",
  low: "thinkingLow",
  medium: "thinkingMedium",
  high: "thinkingHigh",
  xhigh: "thinkingXhigh",
  max: "thinkingMax"
};
function normalizeThinkingLevel(value) {
  switch ((value ?? "").toLowerCase()) {
    case "off":
      return "off";
    case "minimal":
      return "minimal";
    case "low":
      return "low";
    case "medium":
      return "medium";
    case "high":
      return "high";
    case "xhigh":
      return "xhigh";
    case "max":
      return "max";
    default:
      return "off";
  }
}
function thinkingThemeToken(value) {
  return THINKING_TOKEN[normalizeThinkingLevel(value)];
}
function formatWindow(tokens) {
  if (!tokens || tokens <= 0) return "?";
  if (tokens >= 1e6) {
    const value = tokens / 1e6;
    return `${Number.isInteger(value) ? value.toFixed(0) : value.toFixed(1)}M`;
  }
  if (tokens >= 1e3) {
    const value = tokens / 1e3;
    return `${Number.isInteger(value) ? value.toFixed(0) : value.toFixed(1)}k`;
  }
  return `${tokens}`;
}
function statuslineContextInfo(ctx) {
  const usage = ctx.getContextUsage();
  const contextWindow = usage?.contextWindow ?? ctx.model?.contextWindow ?? 0;
  if (typeof usage?.percent !== "number") return { label: formatWindow(contextWindow), percent: null };
  const usedPercent = Math.max(0, Math.min(100, Math.round(usage.percent)));
  return { label: formatWindow(contextWindow), percent: 100 - usedPercent };
}
function accountLabel(ctx) {
  if (!settingBoolean("statusline.showAccount", true, ctx.cwd)) return "";
  if (ctx.model?.provider !== "pi-claude") return "";
  return readClaudeBillingIdentityBridge()?.currentLoginEmail(ctx.sessionManager.getSessionId()) ?? "";
}
function gitBadge(state, showDirtyMarker) {
  if (!state.branch) return "";
  const icon = state.inLinkedWorktree || state.branch !== "main" ? `\u{1F333} ${state.branch}` : "\u{1F980}";
  return ` (${icon}${state.dirty && showDirtyMarker ? "*" : ""})`;
}
function makeFallbackGitState(cwd) {
  return { projectName: basename4(cwd), dirty: false, inLinkedWorktree: false };
}
async function runGit(pi, cwd, args) {
  try {
    const result = await pi.exec("git", ["-C", cwd, ...args], { timeout: settingNumber("gitRefreshTimeoutMs", 1500, cwd) });
    if (result.code !== 0) return void 0;
    const stdout = result.stdout.trim();
    return stdout.length > 0 ? stdout : void 0;
  } catch {
    return void 0;
  }
}
async function refreshGitState(pi, ctx) {
  const cwd = ctx.cwd;
  const topLevel = await runGit(pi, cwd, ["rev-parse", "--show-toplevel"]);
  if (!topLevel) return makeFallbackGitState(cwd);
  const [remote, worktreesRaw, branchRaw, shortHead, diffExit] = await Promise.all([
    runGit(pi, cwd, ["remote", "get-url", "origin"]),
    runGit(pi, cwd, ["worktree", "list", "--porcelain"]),
    runGit(pi, cwd, ["branch", "--show-current"]),
    runGit(pi, cwd, ["rev-parse", "--short", "HEAD"]),
    pi.exec("git", ["-C", cwd, "diff-index", "--quiet", "HEAD", "--"], { timeout: settingNumber("gitRefreshTimeoutMs", 1500, cwd) }).then((result) => result.code).catch(() => 0)
  ]);
  const firstWorktreeLine = worktreesRaw?.split("\n").find((line) => line.startsWith("worktree "));
  const mainWorktree = firstWorktreeLine?.slice("worktree ".length).trim();
  const inLinkedWorktree = Boolean(mainWorktree && mainWorktree !== topLevel);
  const projectName = repoNameFromRemote(remote ?? "") ?? basename4(mainWorktree || topLevel);
  const branch = branchRaw || shortHead;
  return { projectName, branch, dirty: diffExit === 1, inLinkedWorktree };
}
function normalizedSessionName(pi) {
  const name = pi.getSessionName();
  if (!name) return void 0;
  const normalized = stripAnsi(name).replace(/[\x00-\x1f\x7f]/g, " ").replace(/\s+/g, " ").trim();
  return normalized || void 0;
}
function sessionNameHeader(width, pi, theme) {
  const name = normalizedSessionName(pi);
  if (!name || width < 4) return [];
  const prefixPlain = "Session ";
  const prefix = theme.fg("muted", prefixPlain);
  const innerWidth = Math.max(1, width - visibleWidth5(prefixPlain) - 2);
  const inner = truncateToWidth8(name, innerWidth, glyphs().ellipsis);
  const plain = ` ${inner} `;
  const badge = theme.bg("selectedBg", theme.fg("text", plain));
  return [truncateToWidth8(`${prefix}${badge}`, width, "")];
}
function formatTmuxSessionTitle(sessionName) {
  return `${glyphs().prompt} ${sessionName}`;
}
function tmuxPaneTarget() {
  return process.env.TMUX && process.env.TMUX_PANE ? process.env.TMUX_PANE : void 0;
}
function readTmuxPaneTitle(target, callback) {
  execFile2("tmux", ["display-message", "-p", "-t", target, "#{pane_title}"], { timeout: 1e3 }, (error, stdout) => callback(error ? void 0 : stdout.replace(/\r?\n$/, "")));
}
function readTmuxWindowOption(target, option, callback) {
  execFile2("tmux", ["show-options", "-wqv", "-t", target, option], { timeout: 1e3 }, (error, stdout) => callback(error ? void 0 : stdout.replace(/\r?\n$/, "")));
}
function setTmuxPaneTitle(target, title) {
  execFile2("tmux", ["select-pane", "-t", target, "-T", title], { timeout: 1e3 }, () => void 0);
}
function setTmuxWindowOption(target, option, value) {
  execFile2("tmux", ["set-option", "-wq", "-t", target, option, value], { timeout: 1e3 }, () => void 0);
}
function readTmuxWindowName(target, callback) {
  execFile2("tmux", ["display-message", "-p", "-t", target, "#{window_name}"], { timeout: 1e3 }, (error, stdout) => callback(error ? void 0 : stdout.replace(/\r?\n$/, "")));
}
function setTmuxWindowName(target, name) {
  execFile2("tmux", ["rename-window", "-t", target, name], { timeout: 1e3 }, () => void 0);
}
function cavemanIconTone(mode, active) {
  if (!active) return "muted";
  switch (mode) {
    case "micro":
      return "text";
    case "lite":
      return "success";
    case "full":
      return "thinkingHigh";
    case "ultra":
      return "error";
    default:
      return "muted";
  }
}
function renderStatusLine(width, ctx, git, pi, theme, workingIndicator = "") {
  const { label: contextLabel, percent } = statuslineContextInfo(ctx);
  const provider = settingBoolean("statusline.showProvider", true, ctx.cwd) && ctx.model ? formatProviderName(ctx.model.provider) : "";
  const projectChunk = `${git.projectName}${gitBadge(git, settingBoolean("showDirtyMarker", true, ctx.cwd))} ${provider ? `${provider} / ` : ""}${formatModelName(ctx)}`;
  const workingPrefix = workingIndicator ? `${workingIndicator} ` : "";
  const statusSeparator = " / ";
  const thinkingLevel = normalizeThinkingLevel(pi.getThinkingLevel());
  const thinkingChunk = thinkingLevel;
  const contextChunk = ` ${contextLabel}`;
  const account = accountLabel(ctx);
  const cavemanBridge = readCavemanBridge();
  const cavemanVisible = !!cavemanBridge && (cavemanBridge.isStatusBadgeEnabled?.(ctx.cwd) ?? true);
  const caveman = cavemanVisible ? cavemanBridge : void 0;
  const cavemanActive = caveman?.isActive() ?? false;
  const cavemanGlyph = caveman ? cavemanActive ? CAVEMAN_ICON_ACTIVE : CAVEMAN_ICON_INACTIVE : "";
  const cavemanTone = cavemanIconTone(caveman?.getMode() ?? "off", cavemanActive);
  const contextSeparator = caveman ? ` ${statusSeparator}` : "";
  const percentPlain = percent === null ? `${glyphs(ctx.cwd).ellipsis}%` : `${percent}%`;
  const subagentMarker = subagentStatuslineMarker(ctx.cwd);
  const rightPlain = subagentMarker ? `${percentPlain} ${subagentMarker.plain}` : percentPlain;
  const percentColor = percent === null ? "muted" : percent <= 15 ? "error" : percent <= 30 ? "warning" : "success";
  const separatorColored = theme.fg("muted", statusSeparator);
  const thinkingToken = thinkingThemeToken(thinkingLevel);
  const accountColored = account ? `${separatorColored}${theme.fg("muted", account)}` : "";
  const leftColored = caveman ? `${theme.fg("accent", projectChunk)}${separatorColored}${theme.fg(thinkingToken, thinkingChunk)}${separatorColored}${theme.fg(cavemanTone, cavemanGlyph)}${theme.fg("muted", contextSeparator)}${theme.fg("accent", contextChunk.trimStart())}${accountColored}` : `${theme.fg("accent", projectChunk)}${separatorColored}${theme.fg(thinkingToken, thinkingChunk)}${theme.fg("accent", contextChunk)}${accountColored}`;
  const right = subagentMarker ? `${theme.fg(percentColor, percentPlain)} ${subagentMarker.styled}` : theme.fg(percentColor, percentPlain);
  const minimumGap = 1;
  const gapWidth = Math.max(minimumGap, width - visibleWidth5(workingPrefix + leftColored) - visibleWidth5(rightPlain) - 2);
  const filled = percent === null ? 0 : Math.round(gapWidth * (percent / 100));
  const empty = Math.max(0, gapWidth - filled);
  const bar = " ".repeat(empty) + theme.fg("warning", glyphs(ctx.cwd).line.repeat(filled));
  return truncateToWidth8(`${workingPrefix}${leftColored} ${bar} ${right}`, width, "");
}

// src/extensions/qol/thinking-timer.ts
import { AssistantMessageComponent } from "@earendil-works/pi-coding-agent";
function getThinkingTimerStore() {
  return globalThis[THINKING_TIMER_STORE_SYMBOL];
}
function formatThinkingElapsed(ms) {
  const totalSeconds = ms / 1e3;
  if (totalSeconds < 60) return `${totalSeconds.toFixed(1)}s`;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds - minutes * 60;
  return `${minutes}:${seconds.toFixed(1).padStart(4, "0")}`;
}
function thinkingLabel(cwd) {
  const configured = settingString("thinkingLabel.text", THINKING_LABEL_DEFAULT, cwd);
  return configured.trim() ? configured : THINKING_LABEL_DEFAULT;
}
function thinkingTimerLabel(theme, ms, cwd) {
  const base = thinkingLabel(cwd);
  const separator = /\s$/.test(base) ? "" : " ";
  const elapsed = `${separator}${formatThinkingElapsed(ms)}`;
  if (!theme) return `${base}${elapsed}`;
  return theme.italic(theme.fg("muted", base) + theme.fg("dim", elapsed));
}
function hiddenThinkingLabel(theme, cwd) {
  const base = thinkingLabel(cwd);
  return theme ? theme.fg("muted", base) : base;
}
function thinkingTimerKey(timestamp, contentIndex) {
  return `${timestamp}:${contentIndex}`;
}
function installThinkingTimerPatch() {
  const proto = AssistantMessageComponent.prototype;
  if (proto[THINKING_TIMER_PATCH_SYMBOL]) return;
  const originalUpdateContent = proto.updateContent;
  if (typeof originalUpdateContent !== "function") return;
  proto[THINKING_TIMER_PATCH_SYMBOL] = true;
  proto.updateContent = function patchedUpdateContent(message2) {
    originalUpdateContent.call(this, message2);
    try {
      const store = getThinkingTimerStore();
      if (!store?.enabled) return;
      if (!message2 || !Array.isArray(message2.content) || typeof message2.timestamp !== "number") return;
      if (!this.hideThinkingBlock) return;
      if (!this.contentContainer || !Array.isArray(this.contentContainer.children)) return;
      const thinkingIndices = [];
      for (let i = 0; i < message2.content.length; i++) {
        const content = message2.content[i];
        if (content?.type === "thinking" && typeof content.thinking === "string" && content.thinking.trim()) thinkingIndices.push(i);
      }
      if (thinkingIndices.length === 0) return;
      const labelComponents = [];
      for (const child of this.contentContainer.children) {
        if (!child || typeof child !== "object") continue;
        if (typeof child.setText !== "function") continue;
        if (typeof child.text !== "string") continue;
        const expectedLabel = thinkingLabel(store.cwd);
        if (!child.text.includes(expectedLabel) && !child.text.includes("Thinking...")) continue;
        labelComponents.push(child);
      }
      if (labelComponents.length === 0) return;
      const count = Math.min(thinkingIndices.length, labelComponents.length);
      for (let i = 0; i < count; i++) {
        const contentIndex = thinkingIndices[i];
        const label = labelComponents[i];
        const key = thinkingTimerKey(message2.timestamp, contentIndex);
        store.labels.set(key, label);
        const duration = store.durations.get(key);
        const start = store.starts.get(key);
        const ms = duration ?? (start === void 0 ? void 0 : Date.now() - start);
        if (ms !== void 0) label.setText(thinkingTimerLabel(store.theme, ms, store.cwd));
      }
    } catch {
    }
  };
}

// src/extensions/qol.ts
function qol(pi) {
  const guard = pi;
  if (guard[INSTALL_SYMBOL]) return;
  guard[INSTALL_SYMBOL] = true;
  if (!settingBoolean("enabled", true)) return;
  registerGatewayPrivacy(pi);
  installThinkingTimerPatch();
  const thinkingTimerStore = {
    enabled: false,
    starts: /* @__PURE__ */ new Map(),
    durations: /* @__PURE__ */ new Map(),
    labels: /* @__PURE__ */ new Map()
  };
  globalThis[THINKING_TIMER_STORE_SYMBOL] = thinkingTimerStore;
  let idleCompactionTimer;
  let questionSubscribeTimer;
  let sessionSearchWarmupTimer;
  let thinkingTimerTicker;
  let questionUnsubscribe;
  let lastTaskStats;
  let autoRenameAttempted = false;
  let autoRenameInProgress = false;
  let autoRenameGeneration = 0;
  let latestSystemPromptOptions;
  let statusEditor;
  const resetAutoRename = () => {
    autoRenameAttempted = false;
    autoRenameInProgress = false;
    autoRenameGeneration += 1;
  };
  const attemptAutoRename = async (ctx, options = {}) => {
    try {
      const force = options.force === true;
      let cwd;
      try {
        cwd = ctx.cwd;
      } catch (error) {
        if (isStaleCtxError(error)) return;
        throw error;
      }
      if (!force && !autoRenameEnabled(cwd)) return;
      if (autoRenameInProgress) return;
      if (!force && (autoRenameAttempted || pi.getSessionName())) return;
      let branch;
      try {
        branch = ctx.sessionManager.getBranch?.() ?? [];
      } catch (error) {
        if (isStaleCtxError(error)) return;
        throw error;
      }
      const maxInputChars = Math.max(200, Math.floor(settingNumber("sessionAutoRename.maxInputChars", 2e3, cwd)));
      const sourceText = options.fullConversation ? conversationTranscriptText(branch, maxInputChars) : firstUserMessageText(branch);
      if (!sourceText) {
        if (force) autoRenameNotify(ctx, "No user message found to name this session.", "warning", true);
        return;
      }
      const generation = autoRenameGeneration;
      if (!force) autoRenameAttempted = true;
      autoRenameInProgress = true;
      try {
        const result = await generateAutoRenameName(sourceText, ctx, options.fullConversation === true);
        if (generation !== autoRenameGeneration) return;
        if (!result.name) {
          autoRenameNotify(ctx, "No session name generated.", "warning", options.notify === true || force);
          return;
        }
        if (!force && pi.getSessionName()) return;
        const name = withAutoRenamePrefix(result.name, cwd);
        if (!name) return;
        pi.setSessionName(name);
        autoRenameNotify(ctx, `Session named: ${name} (${result.source})`, "info", options.notify === true || force);
      } finally {
        if (generation === autoRenameGeneration) autoRenameInProgress = false;
      }
    } catch (error) {
      if (isStaleCtxError(error)) return;
      throw error;
    }
  };
  const stopThinkingTimerTicker = () => {
    if (thinkingTimerTicker) clearInterval(thinkingTimerTicker);
    thinkingTimerTicker = void 0;
  };
  const tickThinkingTimer = () => {
    if (!thinkingTimerStore.enabled || thinkingTimerStore.starts.size === 0) {
      stopThinkingTimerTicker();
      return;
    }
    for (const [key, start] of thinkingTimerStore.starts.entries()) {
      const label = thinkingTimerStore.labels.get(key);
      if (label) label.setText(thinkingTimerLabel(thinkingTimerStore.theme, Date.now() - start, thinkingTimerStore.cwd));
    }
  };
  const startThinkingTimerTicker = () => {
    if (thinkingTimerTicker) return;
    thinkingTimerTicker = setInterval(tickThinkingTimer, 250);
    thinkingTimerTicker.unref?.();
  };
  const resetThinkingTimer = (ctx) => {
    stopThinkingTimerTicker();
    thinkingTimerStore.starts.clear();
    thinkingTimerStore.durations.clear();
    thinkingTimerStore.labels.clear();
    thinkingTimerStore.cwd = ctx?.cwd;
    thinkingTimerStore.theme = ctx?.ui.theme;
    thinkingTimerStore.enabled = !!ctx?.hasUI && settingBoolean("thinkingTimer.enabled", true, ctx?.cwd);
  };
  const applyWorkingIndicatorMode = (ctx) => {
    if (!ctx.hasUI) return;
    const mode = settingString("workingIndicator.mode", "static", ctx.cwd);
    if (mode === "static") {
      ctx.ui.setWorkingVisible(true);
      ctx.ui.setWorkingIndicator({ frames: [ctx.ui.theme.fg("accent", "\u25CF")] });
      return;
    }
    ctx.ui.setWorkingVisible(true);
    ctx.ui.setWorkingIndicator(void 0);
  };
  const updateThinkingTimerEnabled = (ctx) => {
    thinkingTimerStore.cwd = ctx.cwd;
    thinkingTimerStore.theme = ctx.ui.theme;
    const enabled = ctx.hasUI && settingBoolean("thinkingTimer.enabled", true, ctx.cwd);
    if (thinkingTimerStore.enabled && !enabled) resetThinkingTimer(ctx);
    thinkingTimerStore.enabled = enabled;
    return enabled;
  };
  const finalizeThinkingBlock = (key, endTimeMs = Date.now()) => {
    const start = thinkingTimerStore.starts.get(key);
    if (start === void 0) return;
    const duration = Math.max(0, endTimeMs - start);
    thinkingTimerStore.starts.delete(key);
    thinkingTimerStore.durations.set(key, duration);
    for (const oldest of thinkingTimerStore.durations.keys()) {
      if (thinkingTimerStore.durations.size <= THINKING_TIMER_MAX_DURATIONS) break;
      thinkingTimerStore.durations.delete(oldest);
    }
    const label = thinkingTimerStore.labels.get(key);
    if (label) label.setText(thinkingTimerLabel(thinkingTimerStore.theme, duration, thinkingTimerStore.cwd));
    if (thinkingTimerStore.starts.size === 0) stopThinkingTimerTicker();
  };
  const releaseFinishedThinkingLabels = () => {
    for (const key of thinkingTimerStore.labels.keys()) {
      if (!thinkingTimerStore.starts.has(key)) thinkingTimerStore.labels.delete(key);
    }
  };
  const clearIdleCompactionTimer = () => {
    if (idleCompactionTimer) clearTimeout(idleCompactionTimer);
    idleCompactionTimer = void 0;
  };
  const budgetGuardDriver = new BudgetGuardDriver();
  let budgetGuardStatus;
  let budgetGuardSession;
  const setBudgetGuardStatus = (ctx, message2) => {
    budgetGuardStatus = message2;
    if (ctx.hasUI) {
      ctx.ui.setStatus("qol-budget-guard", message2 ? ctx.ui.theme.fg("accent", message2) : void 0);
      requestRender();
    }
  };
  const budgetGuardGenerationForContext = (ctx) => {
    if (!budgetGuardSession) return void 0;
    try {
      return ctx.sessionManager === budgetGuardSession.sessionManager ? budgetGuardSession.generation : void 0;
    } catch (error) {
      if (isStaleCtxError(error)) return void 0;
      throw error;
    }
  };
  const startBudgetGuardSession = (ctx) => {
    const generation = budgetGuardDriver.reset();
    budgetGuardSession = { generation, sessionManager: ctx.sessionManager };
    budgetGuardStatus = void 0;
  };
  const resetBudgetGuard = (ctx) => {
    if (budgetGuardGenerationForContext(ctx) === void 0) return;
    budgetGuardDriver.reset();
    budgetGuardSession = void 0;
    budgetGuardStatus = void 0;
  };
  const stageBudgetGuard = (ctx) => {
    const generation = budgetGuardGenerationForContext(ctx);
    if (generation === void 0) return;
    let trigger;
    try {
      trigger = budgetGuardTrigger(ctx);
    } catch (error) {
      if (isStaleCtxError(error)) return;
      throw error;
    }
    budgetGuardDriver.stage(trigger, void 0, generation);
  };
  const fireStagedBudgetGuard = async (ctx) => {
    const generation = budgetGuardGenerationForContext(ctx);
    if (generation === void 0) return;
    const notifySafely = (message2, level) => {
      try {
        if (ctx.hasUI && settingBoolean("compaction.notify", true, ctx.cwd)) ctx.ui.notify(message2, level);
      } catch (error) {
        if (isStaleCtxError(error)) return;
        throw error;
      }
    };
    const dispatch = budgetGuardDriver.dispatchPending({
      compact: typeof ctx.compact === "function" ? ctx.compact.bind(ctx) : void 0,
      generation,
      notify: notifySafely,
      onStatus: (message2) => setBudgetGuardStatus(ctx, message2)
    });
    await dispatch.completion;
  };
  const scheduleIdleCompaction = (ctx) => {
    clearIdleCompactionTimer();
    if (autoCompactionGate("idle", ctx.cwd) !== "enabled") return;
    const reason = compactionTriggerReason(ctx);
    if (!reason) return;
    const delayMs = Math.max(1, Math.floor(settingNumber("compaction.idleTimeoutSeconds", DEFAULT_IDLE_COMPACTION_SECONDS, ctx.cwd))) * 1e3;
    idleCompactionTimer = setTimeout(() => {
      idleCompactionTimer = void 0;
      try {
        if (!ctx.isIdle?.()) return;
      } catch (error) {
        if (isStaleCtxError(error)) return;
        throw error;
      }
      const latestReason = compactionTriggerReason(ctx);
      if (!latestReason) return;
      const notifySafely = (message2, level) => {
        try {
          if (ctx.hasUI && settingBoolean("compaction.notify", true, ctx.cwd)) ctx.ui.notify(message2, level);
        } catch (error) {
          if (isStaleCtxError(error)) return;
          throw error;
        }
      };
      notifySafely(`QOL idle compaction starting: ${latestReason}`, "info");
      try {
        ctx.compact?.({
          customInstructions: `QOL idle compaction triggered after inactivity because ${latestReason}. Preserve current task state, decisions, files, blockers, and next steps.`,
          onComplete: () => notifySafely("QOL idle compaction completed.", "info"),
          onError: (error) => notifySafely(`QOL idle compaction failed: ${stringifyError(error)}`, "error")
        });
      } catch (error) {
        if (isStaleCtxError(error)) return;
        throw error;
      }
    }, delayMs);
    idleCompactionTimer.unref?.();
  };
  const clearQuestionSubscribeTimer = () => {
    if (questionSubscribeTimer) clearInterval(questionSubscribeTimer);
    questionSubscribeTimer = void 0;
  };
  const subscribeToQuestions = (ctx) => {
    if (questionUnsubscribe) return true;
    const service = getQuestionService();
    if (!service) return false;
    questionUnsubscribe = service.subscribe((event) => {
      if (event?.action !== "opened") return;
      notifyQuestionOpened(pi, ctx, { requestId: event.requestId, request: event.request, source: event.source }, "question");
    });
    return true;
  };
  const startQuestionSubscription = (ctx) => {
    if (subscribeToQuestions(ctx) || questionSubscribeTimer) return;
    let attempts = 0;
    questionSubscribeTimer = setInterval(() => {
      attempts += 1;
      if (subscribeToQuestions(ctx) || attempts >= 40) clearQuestionSubscribeTimer();
    }, 250);
    questionSubscribeTimer.unref?.();
  };
  let pendingTaskCompleteNotification;
  let activeTui;
  let gitState;
  let refreshInFlight;
  let sessionTitleTimer;
  let tmuxPaneTitleTarget;
  let tmuxOriginalPaneTitle;
  let tmuxOriginalPaneBorderStatus;
  let tmuxOriginalPaneBorderFormat;
  let tmuxChangedPaneBorderStatus = false;
  let tmuxChangedPaneBorderFormat = false;
  let tmuxLastPaneTitle;
  let tmuxOriginalWindowNameTitle;
  let tmuxOriginalAutomaticRename;
  let tmuxChangedAutomaticRename = false;
  let tmuxLastWindowNameTitle;
  let lastSessionTitle;
  const requestRender = () => activeTui?.requestRender();
  const scheduleController = createScheduleController(pi);
  scheduleController.setOnChange(requestRender);
  const rateLimitAutoResumeController = createRateLimitAutoResumeController(pi);
  rateLimitAutoResumeController.setOnChange(requestRender);
  const statuslineEnabled = (ctx) => settingBoolean("statusline.enabled", true, ctx.cwd);
  const refreshStatusline = (ctx) => {
    if (!statuslineEnabled(ctx)) return Promise.resolve();
    if (refreshInFlight) return refreshInFlight;
    refreshInFlight = refreshGitState(pi, ctx).then((next) => {
      gitState = next;
      requestRender();
    }).finally(() => {
      refreshInFlight = void 0;
    });
    return refreshInFlight;
  };
  const syncSessionTitle = (ctx) => {
    const sessionTitle = normalizedSessionName(pi);
    if (sessionTitle !== lastSessionTitle) {
      lastSessionTitle = sessionTitle;
      requestRender();
    }
    ctx.ui.setStatus(SESSION_MANAGER_STATUS_KEY, void 0);
    const target = tmuxPaneTitleTarget;
    if (!target) return;
    const nextTitle = sessionTitle ? formatTmuxSessionTitle(sessionTitle) : tmuxOriginalPaneTitle;
    if (nextTitle !== void 0 && nextTitle !== tmuxLastPaneTitle) {
      tmuxLastPaneTitle = nextTitle;
      setTmuxPaneTitle(target, nextTitle);
    }
    if (settingBoolean("showSessionNameWindow", true, ctx.cwd)) {
      const nextWindow = sessionTitle ? formatTmuxSessionTitle(sessionTitle) : tmuxOriginalWindowNameTitle;
      if (nextWindow !== void 0 && nextWindow !== tmuxLastWindowNameTitle) {
        tmuxLastWindowNameTitle = nextWindow;
        setTmuxWindowName(target, nextWindow);
      }
    }
  };
  const installSessionTitle = (ctx) => {
    if (!settingBoolean("showSessionNameTitle", true, ctx.cwd)) return;
    const tmuxTarget = tmuxPaneTarget();
    if (tmuxTarget) {
      tmuxPaneTitleTarget = tmuxTarget;
      readTmuxPaneTitle(tmuxTarget, (title) => {
        if (tmuxPaneTitleTarget !== tmuxTarget) return;
        tmuxOriginalPaneTitle = title;
        syncSessionTitle(ctx);
      });
      readTmuxWindowOption(tmuxTarget, "pane-border-status", (value) => {
        if (tmuxPaneTitleTarget !== tmuxTarget) return;
        tmuxOriginalPaneBorderStatus = value;
        if (!value || value === "off") {
          tmuxChangedPaneBorderStatus = true;
          setTmuxWindowOption(tmuxTarget, "pane-border-status", "top");
        }
      });
      readTmuxWindowOption(tmuxTarget, "pane-border-format", (value) => {
        if (tmuxPaneTitleTarget !== tmuxTarget) return;
        tmuxOriginalPaneBorderFormat = value;
        if (value !== TMUX_SESSION_TITLE_BORDER_FORMAT) {
          tmuxChangedPaneBorderFormat = true;
          setTmuxWindowOption(tmuxTarget, "pane-border-format", TMUX_SESSION_TITLE_BORDER_FORMAT);
        }
      });
      if (settingBoolean("showSessionNameWindow", true, ctx.cwd)) {
        readTmuxWindowName(tmuxTarget, (name) => {
          if (tmuxPaneTitleTarget !== tmuxTarget) return;
          tmuxOriginalWindowNameTitle = name;
          syncSessionTitle(ctx);
        });
        readTmuxWindowOption(tmuxTarget, "automatic-rename", (value) => {
          if (tmuxPaneTitleTarget !== tmuxTarget) return;
          tmuxOriginalAutomaticRename = value;
          if (value !== "off") {
            tmuxChangedAutomaticRename = true;
            setTmuxWindowOption(tmuxTarget, "automatic-rename", "off");
          }
        });
      }
      return;
    }
    ctx.ui.setHeader((tui, theme) => {
      activeTui = tui;
      return {
        invalidate() {
        },
        render(width) {
          return sessionNameHeader(width, pi, theme);
        }
      };
    });
  };
  const installSessionTitleSync = (ctx) => {
    syncSessionTitle(ctx);
    sessionTitleTimer = setInterval(() => syncSessionTitle(ctx), SESSION_TITLE_SYNC_INTERVAL_MS);
    sessionTitleTimer.unref?.();
  };
  const resetStatuslineUi = (ctx) => {
    if (sessionTitleTimer) clearInterval(sessionTitleTimer);
    sessionTitleTimer = void 0;
    if (tmuxPaneTitleTarget && tmuxOriginalPaneTitle !== void 0) setTmuxPaneTitle(tmuxPaneTitleTarget, tmuxOriginalPaneTitle);
    if (tmuxPaneTitleTarget && tmuxChangedPaneBorderStatus && tmuxOriginalPaneBorderStatus !== void 0) setTmuxWindowOption(tmuxPaneTitleTarget, "pane-border-status", tmuxOriginalPaneBorderStatus);
    if (tmuxPaneTitleTarget && tmuxChangedPaneBorderFormat && tmuxOriginalPaneBorderFormat !== void 0) setTmuxWindowOption(tmuxPaneTitleTarget, "pane-border-format", tmuxOriginalPaneBorderFormat);
    if (tmuxPaneTitleTarget && tmuxOriginalWindowNameTitle !== void 0 && tmuxLastWindowNameTitle !== void 0) setTmuxWindowName(tmuxPaneTitleTarget, tmuxOriginalWindowNameTitle);
    if (tmuxPaneTitleTarget && tmuxChangedAutomaticRename && tmuxOriginalAutomaticRename !== void 0) setTmuxWindowOption(tmuxPaneTitleTarget, "automatic-rename", tmuxOriginalAutomaticRename);
    tmuxPaneTitleTarget = void 0;
    tmuxOriginalPaneTitle = void 0;
    tmuxOriginalPaneBorderStatus = void 0;
    tmuxOriginalPaneBorderFormat = void 0;
    tmuxChangedPaneBorderStatus = false;
    tmuxChangedPaneBorderFormat = false;
    tmuxLastPaneTitle = void 0;
    tmuxOriginalWindowNameTitle = void 0;
    tmuxOriginalAutomaticRename = void 0;
    tmuxChangedAutomaticRename = false;
    tmuxLastWindowNameTitle = void 0;
    lastSessionTitle = void 0;
    ctx.ui.setStatus(SESSION_MANAGER_STATUS_KEY, void 0);
    ctx.ui.setWidget("statusline", void 0);
    ctx.ui.setHeader(void 0);
    ctx.ui.setFooter(void 0);
    activeTui = void 0;
    statusEditor = void 0;
  };
  const maybeNotifyTaskCompletion = (_ctx, state) => {
    const stats = taskStats(state);
    if (!stats) return;
    const previous = lastTaskStats;
    lastTaskStats = stats;
    if (stats.total === 0 || stats.remaining !== 0 || stats.completed !== stats.total) {
      pendingTaskCompleteNotification = void 0;
      return;
    }
    if (previous && previous.total === stats.total && previous.remaining === 0 && previous.completed === stats.completed) return;
    if (previous && previous.remaining <= 0) return;
    pendingTaskCompleteNotification = `Task list complete: ${stats.completed}/${stats.total} done.`;
  };
  let currentCtx;
  let cavemanUnsubscribe;
  const subscribeCavemanBridge = () => {
    cavemanUnsubscribe?.();
    cavemanUnsubscribe = void 0;
    const bridge = readCavemanBridge();
    if (!bridge) return;
    cavemanUnsubscribe = bridge.subscribe(() => requestRender());
  };
  const notificationService = {
    notifyQuestionOpened(ctx, event) {
      notifyQuestionOpened(pi, ctx ?? currentCtx, event, "question");
      return true;
    }
  };
  globalThis[QOL_NOTIFICATION_SERVICE_SYMBOL] = notificationService;
  pi.events.on(QUESTION_OPENED_EVENT, (data) => {
    if (!data || typeof data !== "object") return;
    const event = data;
    notifyQuestionOpened(pi, currentCtx, event, "question");
  });
  pi.events.on(RATE_LIMIT_AUTO_RESUME_EVENT, (payload) => {
    if (!currentCtx) return;
    rateLimitAutoResumeController.noteExternalRateLimitEvent(payload, currentCtx);
  });
  installSettingsCacheRefresh(pi);
  pi.on("session_start", (event, ctx) => {
    recordProjectTrust(ctx);
    const pruned = pruneLanes(join5(piUserDir(), "kendex", "sessions"), QOL_BUDGET_HANDOFF_FOLDER.split("/"));
    for (const failure of pruned.failed) {
      console.warn(`handoff-prune-error: ${failure.path}
${failure.error}`);
    }
    currentCtx = ctx;
    subscribeCavemanBridge();
    latestSystemPromptOptions = void 0;
    resetAutoRename();
    startBudgetGuardSession(ctx);
    resetThinkingTimer(ctx);
    const scheduleEnabled = settingBoolean("enableScheduleCommand", true, ctx.cwd);
    const rateLimitAutoResumeEnabled = rateLimitAutoResumeController.enabled(ctx);
    if (scheduleEnabled) scheduleController.restoreFromBranch(ctx);
    else scheduleController.clearTimers();
    void consumePendingSessionSearchContext(pi, ctx, event.reason);
    installAutocompleteHintStyling(ctx);
    installPendingQueueThemePatch(ctx);
    installStatusTextAlignmentPatch(ctx);
    if (ctx.hasUI) {
      ctx.ui.setHiddenThinkingLabel(hiddenThinkingLabel(ctx.ui.theme, ctx.cwd));
      applyWorkingIndicatorMode(ctx);
      gitState = makeFallbackGitState(ctx.cwd);
      const showStatusline = statuslineEnabled(ctx);
      if (showStatusline) void refreshStatusline(ctx);
      installSessionTitle(ctx);
      installSessionTitleSync(ctx);
      ctx.ui.setEditorComponent((tui, theme, keybindings) => {
        activeTui = tui;
        statusEditor = settingBoolean("compactPrompt", true, ctx.cwd) ? new QolCompactPromptEditor(tui, theme, keybindings, Math.max(0, Math.floor(settingNumber("inputBottomPaddingLines", DEFAULT_INPUT_BOTTOM_PADDING_LINES, ctx.cwd))), ctx) : new QolEditor(tui, theme, keybindings, ctx);
        return statusEditor;
      });
      if (showStatusline || scheduleEnabled || rateLimitAutoResumeEnabled) {
        const statusWidgetTimer = setTimeout(() => {
          ctx.ui.setWidget("statusline", (tui, theme) => {
            activeTui = tui;
            return {
              invalidate() {
              },
              render(width) {
                const lines = rateLimitAutoResumeController.enabled(ctx) ? rateLimitAutoResumeController.renderPreviewLines(width) : [];
                if (scheduleEnabled) lines.push(...scheduleController.renderPreviewLines(width));
                if (budgetGuardStatus) lines.push(truncateToWidth9(ansiGreen(`\u2503 ${budgetGuardStatus}`), width, ""));
                if (showStatusline) lines.push(renderStatusLine(width, ctx, gitState ?? makeFallbackGitState(ctx.cwd), pi, theme, statusEditor?.renderWorkingStatus(width)));
                return lines;
              }
            };
          });
        }, 0);
        statusWidgetTimer.unref?.();
        if (showStatusline && settingBoolean("replaceFooter", true, ctx.cwd)) {
          ctx.ui.setFooter((tui, _theme, footerData) => {
            activeTui = tui;
            const unsubscribe = footerData.onBranchChange(() => {
              void refreshStatusline(ctx);
              requestRender();
            });
            return { dispose: unsubscribe, invalidate() {
            }, render: () => [] };
          });
        }
      }
    }
    startQuestionSubscription(ctx);
    void attemptAutoRename(ctx);
    if (ctx.hasUI && settingBoolean("sessionSearch.enabled", true, ctx.cwd)) {
      if (sessionSearchWarmupTimer) clearTimeout(sessionSearchWarmupTimer);
      sessionSearchWarmupTimer = setTimeout(() => {
        sessionSearchWarmupTimer = void 0;
        void refreshQolSessionSearchCache(ctx, { quiet: true }).catch(() => void 0);
      }, 500);
      sessionSearchWarmupTimer.unref?.();
    }
  });
  pi.on("before_agent_start", (event) => {
    latestSystemPromptOptions = event?.systemPromptOptions;
  });
  pi.on("session_shutdown", (_event, ctx) => {
    cavemanUnsubscribe?.();
    cavemanUnsubscribe = void 0;
    scheduleController.clearTimers();
    rateLimitAutoResumeController.clearTimers();
    resetAutoRename();
    resetBudgetGuard(ctx);
    clearIdleCompactionTimer();
    clearQuestionSubscribeTimer();
    if (sessionSearchWarmupTimer) clearTimeout(sessionSearchWarmupTimer);
    sessionSearchWarmupTimer = void 0;
    releaseQolSessionSearchCache();
    clearSessionSearchPendingAction();
    resetThinkingTimer(void 0);
    clearTmuxWindowMark(pi);
    resetQolNotificationCooldowns();
    questionUnsubscribe?.();
    questionUnsubscribe = void 0;
    currentCtx = void 0;
    const host = globalThis;
    if (host[QOL_NOTIFICATION_SERVICE_SYMBOL] === notificationService) delete host[QOL_NOTIFICATION_SERVICE_SYMBOL];
    ctx.ui.setStatus(STATUS_KEY, void 0);
    ctx.ui.setStatus(SESSION_SEARCH_STATUS_KEY, void 0);
    ctx.ui.setStatus("qol-budget-guard", void 0);
    restorePendingQueueThemePatch(ctx);
    restoreStatusTextAlignmentPatch();
    resetStatuslineUi(ctx);
    ctx.ui.setEditorComponent(void 0);
  });
  pi.on("model_select", (_event, ctx) => {
    if (!ctx.hasUI) return;
    void refreshStatusline(ctx);
    requestRender();
  });
  pi.on("thinking_level_select", (_event, ctx) => {
    if (ctx.hasUI) requestRender();
  });
  pi.on("session_info_changed", (_event, ctx) => {
    if (!ctx.hasUI) return;
    syncSessionTitle(ctx);
  });
  pi.on("agent_start", (_event, ctx) => {
    clearIdleCompactionTimer();
    clearTmuxWindowMark(pi);
    rateLimitAutoResumeController.noteAgentStart(ctx);
    if (ctx.hasUI) {
      void refreshStatusline(ctx);
      requestRender();
    }
  });
  pi.on("message_update", (event, ctx) => {
    if (ctx.hasUI) requestRender();
    if (!updateThinkingTimerEnabled(ctx)) return;
    const streamEvent = event.assistantMessageEvent;
    if (!streamEvent || typeof streamEvent.type !== "string") return;
    if (streamEvent.type === "thinking_start" || streamEvent.type === "thinking_delta") {
      const partial = streamEvent.partial;
      if (!partial || typeof partial.timestamp !== "number" || typeof streamEvent.contentIndex !== "number") return;
      const key = thinkingTimerKey(partial.timestamp, streamEvent.contentIndex);
      if (!thinkingTimerStore.starts.has(key) && !thinkingTimerStore.durations.has(key)) thinkingTimerStore.starts.set(key, Date.now());
      startThinkingTimerTicker();
      tickThinkingTimer();
      return;
    }
    if (streamEvent.type === "thinking_end") {
      const partial = streamEvent.partial;
      if (!partial || typeof partial.timestamp !== "number" || typeof streamEvent.contentIndex !== "number") return;
      finalizeThinkingBlock(thinkingTimerKey(partial.timestamp, streamEvent.contentIndex));
    }
  });
  pi.on("message_end", (event, ctx) => {
    rateLimitAutoResumeController.noteMessageEnd(event, ctx);
    if (!updateThinkingTimerEnabled(ctx)) return;
    const message2 = event.message;
    if (!message2 || message2.role !== "assistant" || !Array.isArray(message2.content)) return;
    for (let i = 0; i < message2.content.length; i++) {
      if (message2.content[i]?.type !== "thinking") continue;
      finalizeThinkingBlock(thinkingTimerKey(message2.timestamp, i));
    }
  });
  pi.on("agent_end", (event, ctx) => {
    releaseFinishedThinkingLabels();
    if (ctx.hasUI) {
      void refreshStatusline(ctx);
      requestRender();
    }
    rateLimitAutoResumeController.noteAgentEnd(event, ctx);
    stageBudgetGuard(ctx);
    scheduleIdleCompaction(ctx);
    void attemptAutoRename(ctx);
    const text = lastAssistantTextFromAgentEnd(event, ctx);
    const critical = criticalInfo(text);
    if (critical) {
      pendingTaskCompleteNotification = void 0;
      void sendQolNotification(pi, ctx, "critical", `Critical: ${critical}`, "error", `critical:${critical.slice(0, 80)}`);
      return;
    }
    if (pendingTaskCompleteNotification) {
      const body = pendingTaskCompleteNotification;
      pendingTaskCompleteNotification = void 0;
      void sendQolNotification(pi, ctx, "task-complete", body, "info", "task-complete");
      return;
    }
    if (ctx.hasPendingMessages?.()) return;
    if (needsDirection(text)) {
      void sendQolNotification(pi, ctx, "direction", "Pi is awaiting your direction.", "warning", "direction");
      return;
    }
    void sendQolNotification(pi, ctx, "ready", settingString("notification.readyMessage", "Ready for input", ctx.cwd), "info", "ready");
  });
  pi.on("agent_settled", async (_event, ctx) => {
    await fireStagedBudgetGuard(ctx);
  });
  pi.on("session_compact", (_event, ctx) => {
    const generation = budgetGuardGenerationForContext(ctx);
    if (generation === void 0) return;
    if (budgetGuardStatus) setBudgetGuardStatus(ctx, "QOL budget guard finalizing compaction\u2026");
    budgetGuardDriver.noteSessionCompacted(generation);
    if (!ctx.hasUI) return;
    void refreshStatusline(ctx);
    requestRender();
  });
  pi.on("session_tree", (_event, ctx) => {
    currentCtx = ctx;
    if (settingBoolean("enableScheduleCommand", true, ctx.cwd)) scheduleController.restoreFromBranch(ctx);
    else scheduleController.clearTimers();
  });
  pi.on("after_provider_response", (event, ctx) => {
    rateLimitAutoResumeController.noteProviderResponse(event, ctx);
  });
  pi.on("session_before_compact", (event, ctx) => handleQolCompaction(event, ctx));
  pi.on("session_before_tree", (event, ctx) => handleQolBranchSummary(event, ctx));
  pi.on("tool_call", async (event, ctx) => {
    if (event?.toolName === "question") {
      notifyQuestionOpened(pi, ctx, { requestId: event.input?.id ?? event.toolCallId, request: event.input, source: "tool_call" }, "question");
      return void 0;
    }
    if (!settingBoolean("permissionGate.enabled", false, ctx.cwd)) return void 0;
    if (event?.toolName !== "bash") return void 0;
    const command = typeof event.input?.command === "string" ? event.input.command : "";
    if (!command) return void 0;
    const matched = permissionGateMatch(command, ctx.cwd);
    if (!matched) return void 0;
    if (!ctx.hasUI) return { block: true, reason: `Command matched permission gate (${matched}) and no UI is available for confirmation` };
    const choice = await ctx.ui.select(permissionGatePrompt(matched, command, ctx.cwd), ["Allow once", "Block"]);
    if (choice !== "Allow once") return { block: true, reason: `Blocked by QOL permission gate (${matched})` };
    return void 0;
  });
  pi.on("tool_result", (event, ctx) => {
    if (event?.toolName === "tasks_write") maybeNotifyTaskCompletion(ctx, event.details?.state);
  });
  pi.on("input", async (event, ctx) => {
    clearTmuxWindowMark(pi);
    if (event.source === "extension") return { action: "continue" };
    const text = event.text ?? "";
    const paths = resolveSubmittedImagePaths(text, ctx.cwd);
    if (paths.length === 0) return { action: "continue" };
    try {
      const images = await imageContentsForPaths(paths, event.images ?? []);
      return { action: "transform", images: [...event.images ?? [], ...images], text: event.text };
    } catch (error) {
      const message2 = `Image submission refused: ${stringifyError(error)}`;
      ctx.ui.notify(message2, "error");
      if (!ctx.hasUI) console.error(message2);
      if (ctx.hasUI && ctx.ui.getEditorText() === "") ctx.ui.setEditorText(text);
      return { action: "handled" };
    }
  });
  if (settingBoolean("enableSessionNameCommand", true)) {
    pi.registerCommand("rename", {
      description: "Current session friendly-name editor.",
      handler: async (args, ctx) => {
        const name = args.trim();
        if (name) {
          pi.setSessionName(name);
          ctx.ui.notify(`Session named: ${name}`, "info");
          return;
        }
        const current = pi.getSessionName();
        ctx.ui.notify(current ? `Session: ${current}` : "No session name set", "info");
      }
    });
  }
  if (settingBoolean("enableHandoffCommand", true)) {
    pi.registerCommand("handoff", {
      description: "Focused context handoff to a new session.",
      handler: async (args, ctx) => runHandoff(args, ctx)
    });
  }
  if (settingBoolean("enableScheduleCommand", true)) {
    pi.registerCommand("schedule", {
      description: "Send a user message after a timer without invoking the model now.",
      getArgumentCompletions: getScheduleArgumentCompletions,
      handler: async (args, ctx) => scheduleController.handleCommand(args, ctx)
    });
  }
  if (settingBoolean("enableContextCommand", true)) {
    pi.registerMessageRenderer(CONTEXT_USAGE_MESSAGE_TYPE, renderQolContextUsageMessage);
    pi.registerCommand("context", {
      description: "Show context-window usage and estimated category breakdowns inline.",
      handler: async (_args, ctx) => {
        const details = buildQolContextUsageDetails(pi, ctx, latestSystemPromptOptions);
        if (!details) {
          ctx.ui.notify("Context usage info is not available yet.", "warning");
          return;
        }
        pi.sendMessage({ customType: CONTEXT_USAGE_MESSAGE_TYPE, content: "Context usage snapshot", details, display: true }, { deliverAs: "followUp", triggerTurn: false });
      }
    });
  }
  if (settingBoolean("sessionSearch.enabled", true)) {
    pi.registerMessageRenderer(SESSION_SEARCH_CONTEXT_TYPE, renderSessionSearchContextMessage);
    const handleSearchCommand = async (args, ctx) => {
      const trimmed = args.trim();
      if (trimmed === "refresh") {
        try {
          const sessions = await refreshQolSessionSearchCache(ctx, { force: true });
          ctx.ui.notify(`Session search refreshed: ${sessions.length} session(s)`, "info");
        } catch (error) {
          ctx.ui.notify(`Session search refresh failed: ${stringifyError(error)}`, "error");
        }
        return;
      }
      await openQolSessionSearch(pi, ctx, trimmed);
    };
    pi.registerCommand("search", {
      description: "Previous-session search and context import.",
      getArgumentCompletions: getSessionSearchArgumentCompletions,
      handler: handleSearchCommand
    });
    pi.registerCommand("search:refresh", {
      description: "Refresh the session search index",
      handler: async (_args, ctx) => handleSearchCommand("refresh", ctx)
    });
    pi.registerCommand("search:resume-pending", {
      description: "Run a pending session-search resume or fork action",
      handler: async (args, ctx) => {
        const action = takeSessionSearchPendingAction(args.trim());
        if (!action) {
          ctx.ui.notify("No pending session-search resume/fork action found.", "warning");
          return;
        }
        if (!await runSessionSearchResumeOrFork(pi, ctx, action)) ctx.ui.notify("Session resume/fork is unavailable in this context.", "error");
      }
    });
    const shortcut = sessionSearchShortcut();
    if (shortcut) {
      pi.registerShortcut(shortcut, {
        description: "Search previous sessions",
        handler: async (ctx) => openQolSessionSearch(pi, ctx)
      });
    }
  }
  const tryOpenExtensionManagerSettings = async (ctx) => {
    const host = globalThis;
    const openQuickSettings = host[/* @__PURE__ */ Symbol.for("kendex.pi.extension-manager.open-quick-settings")];
    if (typeof openQuickSettings !== "function") return false;
    try {
      await openQuickSettings(ctx, "pi-qol");
      return true;
    } catch {
      return false;
    }
  };
  const dispatchQol = async (sub, rest, ctx) => {
    const restLower = rest.toLowerCase();
    if (sub === "status") {
      if (await tryOpenExtensionManagerSettings(ctx)) return;
      ctx.ui.notify(statusMessage(ctx), "info");
      return;
    }
    if (sub === "rename") {
      if (!restLower) {
        await attemptAutoRename(ctx, { force: true, notify: true });
        return;
      }
      if (restLower === "full") {
        await attemptAutoRename(ctx, { force: true, fullConversation: true, notify: true });
        return;
      }
      ctx.ui.notify("Unknown /qol rename mode. Try /qol:rename or /qol:rename:full.", "warning");
      return;
    }
    if (sub === "notify-test") {
      void sendQolNotification(pi, ctx, "test", "QOL notification test", "info", `test:${Date.now()}`);
      ctx.ui.notify("Sent QOL notification test.", "info");
      return;
    }
    ctx.ui.notify("Unknown /qol action. Try /qol, /qol:rename, /qol:rename:full, or /qol notify-test.", "warning");
  };
  pi.registerCommand("qol", {
    description: "QOL helpers and settings.",
    getArgumentCompletions: getQolArgumentCompletions,
    handler: async (args, ctx) => {
      const trimmed = args.trim();
      const firstSpace = trimmed.search(/\s/);
      const sub = (firstSpace < 0 ? trimmed : trimmed.slice(0, firstSpace)).toLowerCase() || "status";
      const rest = firstSpace < 0 ? "" : trimmed.slice(firstSpace + 1).trim();
      await dispatchQol(sub, rest, ctx);
    }
  });
  pi.registerCommand("qol:rename", {
    description: "Generate a session name from the first user message",
    handler: async (_args, ctx) => dispatchQol("rename", "", ctx)
  });
  pi.registerCommand("qol:rename:full", {
    description: "Generate a session name from the full conversation",
    handler: async (_args, ctx) => dispatchQol("rename", "full", ctx)
  });
}
export {
  qol as default
};
