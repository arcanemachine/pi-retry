import type {
  ContextEvent,
  ExtensionAPI,
  ExtensionContext,
  ExtensionEvent,
} from "@earendil-works/pi-coding-agent";
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

type Shortcut = Parameters<ExtensionAPI["registerShortcut"]>[0];
type ContextMessage = ContextEvent["messages"][number];
type MessageEndEvent = Extract<ExtensionEvent, { type: "message_end" }>;

const DEFAULT_RETRY_SHORTCUT = "ctrl+alt+r" as Shortcut;
const RETRY_TRIGGER_TYPE = "pi-retry:trigger";
const TRIGGER_RETRY_DELAY_MS = 50;
const TRIGGER_RETRY_ATTEMPTS = 100;

type RetryAction = "retry" | "resume";

let retryPending = false;
let triggerPending = false;
const suppressedAssistantTimestamps = new Set<number>();

function readSettings(path: string): Record<string, unknown> {
  if (!existsSync(path)) return {};

  try {
    const raw = readFileSync(path, "utf-8");
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object"
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

function getShortcut(cwd: string): Shortcut {
  const home = process.env.HOME || homedir();
  const globalSettings = readSettings(
    join(home, ".pi", "agent", "settings.json"),
  );
  const projectSettings = readSettings(join(cwd, ".pi", "settings.json"));

  const globalConfig = globalSettings["pi-retry"];
  const projectConfig = projectSettings["pi-retry"];

  const globalShortcut =
    globalConfig && typeof globalConfig === "object"
      ? (globalConfig as Record<string, unknown>).shortcut
      : undefined;
  const projectShortcut =
    projectConfig && typeof projectConfig === "object"
      ? (projectConfig as Record<string, unknown>).shortcut
      : undefined;

  if (typeof projectShortcut === "string" && projectShortcut.trim()) {
    return projectShortcut.trim() as Shortcut;
  }

  if (typeof globalShortcut === "string" && globalShortcut.trim()) {
    return globalShortcut.trim() as Shortcut;
  }

  return DEFAULT_RETRY_SHORTCUT;
}

function isRetryTrigger(message: ContextMessage): boolean {
  return message.role === "custom" && message.customType === RETRY_TRIGGER_TYPE;
}

function isSuppressedAssistant(message: ContextMessage): boolean {
  return (
    message.role === "assistant" &&
    message.stopReason === "aborted" &&
    suppressedAssistantTimestamps.has(message.timestamp)
  );
}

function shouldSuppressFromProviderContext(message: ContextMessage): boolean {
  return isRetryTrigger(message) || isSuppressedAssistant(message);
}

function scheduleRetryTrigger(
  pi: ExtensionAPI,
  ctx: ExtensionContext,
  action: RetryAction,
  suppressAssistantTimestamp?: number,
  attempt = 0,
): void {
  setTimeout(() => {
    if (!retryPending) return;

    if (!ctx.isIdle()) {
      if (attempt >= TRIGGER_RETRY_ATTEMPTS) {
        retryPending = false;
        triggerPending = false;
        ctx.ui.notify("Retry failed: agent did not become idle", "warning");
        return;
      }

      scheduleRetryTrigger(
        pi,
        ctx,
        action,
        suppressAssistantTimestamp,
        attempt + 1,
      );
      return;
    }

    triggerPending = true;
    pi.sendMessage(
      {
        customType: RETRY_TRIGGER_TYPE,
        content: "",
        display: false,
        details: {
          timestamp: Date.now(),
          action,
          suppressAssistantTimestamp,
        },
      },
      { triggerTurn: true },
    );
  }, TRIGGER_RETRY_DELAY_MS);
}

function handleMessageEnd(event: MessageEndEvent): void {
  if (!retryPending) return;

  if (
    event.message.role === "assistant" &&
    event.message.stopReason === "aborted"
  ) {
    suppressedAssistantTimestamps.add(event.message.timestamp);
  }
}

function hasEditorText(ctx: ExtensionContext): boolean {
  return ctx.ui.getEditorText().length > 0;
}

function getLeafAbortedAssistantTimestamp(
  ctx: ExtensionContext,
): number | undefined {
  const leaf = ctx.sessionManager.getLeafEntry();
  if (!leaf || leaf.type !== "message") return undefined;

  const { message } = leaf;
  if (message.role !== "assistant" || message.stopReason !== "aborted") {
    return undefined;
  }

  return message.timestamp;
}

function handleContext(
  event: ContextEvent,
): { messages: ContextMessage[] } | undefined {
  const hasRetryTrigger = event.messages.some(isRetryTrigger);
  const messages = event.messages.filter(
    (message) => !shouldSuppressFromProviderContext(message),
  );

  if (hasRetryTrigger && triggerPending) {
    retryPending = false;
    triggerPending = false;
  }

  if (messages.length === event.messages.length) return undefined;
  return { messages };
}

export default function piRetryResponseExtension(pi: ExtensionAPI): void {
  const retryShortcut = getShortcut(process.cwd());

  pi.on("message_end", handleMessageEnd);
  pi.on("context", handleContext);

  pi.registerShortcut(retryShortcut, {
    description: "Retry the in-progress assistant response",
    handler: (ctx) => {
      if (retryPending) {
        ctx.ui.notify("Retry already pending", "info");
        return;
      }

      if (!ctx.isIdle()) {
        retryPending = true;
        ctx.abort();
        scheduleRetryTrigger(pi, ctx, "retry");
        ctx.ui.notify("Retrying response", "info");
        return;
      }

      if (ctx.hasPendingMessages()) {
        ctx.ui.notify("Resume skipped: pending messages queued", "info");
        return;
      }

      if (hasEditorText(ctx)) {
        ctx.ui.notify("Resume skipped: editor has unsent text", "info");
        return;
      }

      const abortedTimestamp = getLeafAbortedAssistantTimestamp(ctx);
      if (abortedTimestamp === undefined) {
        ctx.ui.notify("No stopped response to resume", "info");
        return;
      }

      retryPending = true;
      suppressedAssistantTimestamps.add(abortedTimestamp);
      scheduleRetryTrigger(pi, ctx, "resume", abortedTimestamp);
      ctx.ui.notify("Resuming stopped response", "info");
    },
  });
}
