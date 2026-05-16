import type {
  ContextEvent,
  ExtensionAPI,
  ExtensionContext,
  ExtensionEvent,
} from "@earendil-works/pi-coding-agent";
type Shortcut = Parameters<ExtensionAPI["registerShortcut"]>[0];
type ContextMessage = ContextEvent["messages"][number];
type MessageEndEvent = Extract<ExtensionEvent, { type: "message_end" }>;

const DEFAULT_REFRESH_SHORTCUT = "ctrl+alt+r" as Shortcut;
const REFRESH_TRIGGER_TYPE = "pi-refresh:trigger";
const TRIGGER_RETRY_DELAY_MS = 50;
const TRIGGER_RETRY_ATTEMPTS = 100;

let refreshPending = false;
let triggerPending = false;
const suppressedAssistantTimestamps = new Set<number>();

function getShortcutEnv(name: string, fallback: Shortcut): Shortcut {
  const value = process.env[name]?.trim();
  return (value && value.length > 0 ? value : fallback) as Shortcut;
}

function isRefreshTrigger(message: ContextMessage): boolean {
  return (
    message.role === "custom" && message.customType === REFRESH_TRIGGER_TYPE
  );
}

function isSuppressedAssistant(message: ContextMessage): boolean {
  return (
    message.role === "assistant" &&
    message.stopReason === "aborted" &&
    suppressedAssistantTimestamps.has(message.timestamp)
  );
}

function shouldSuppressFromProviderContext(message: ContextMessage): boolean {
  return isRefreshTrigger(message) || isSuppressedAssistant(message);
}

function scheduleRefreshTrigger(
  pi: ExtensionAPI,
  ctx: ExtensionContext,
  attempt = 0,
): void {
  setTimeout(() => {
    if (!refreshPending) return;

    if (!ctx.isIdle()) {
      if (attempt >= TRIGGER_RETRY_ATTEMPTS) {
        refreshPending = false;
        triggerPending = false;
        ctx.ui.notify("Refresh failed: agent did not become idle", "warning");
        return;
      }

      scheduleRefreshTrigger(pi, ctx, attempt + 1);
      return;
    }

    triggerPending = true;
    pi.sendMessage(
      {
        customType: REFRESH_TRIGGER_TYPE,
        content: "",
        display: false,
        details: { timestamp: Date.now() },
      },
      { triggerTurn: true },
    );
  }, TRIGGER_RETRY_DELAY_MS);
}

function handleMessageEnd(event: MessageEndEvent): void {
  if (!refreshPending) return;

  if (
    event.message.role === "assistant" &&
    event.message.stopReason === "aborted"
  ) {
    suppressedAssistantTimestamps.add(event.message.timestamp);
  }
}

function handleContext(
  event: ContextEvent,
): { messages: ContextMessage[] } | undefined {
  const hasRefreshTrigger = event.messages.some(isRefreshTrigger);
  const messages = event.messages.filter(
    (message) => !shouldSuppressFromProviderContext(message),
  );

  if (hasRefreshTrigger && triggerPending) {
    refreshPending = false;
    triggerPending = false;
  }

  if (messages.length === event.messages.length) return undefined;
  return { messages };
}

export default function piRefreshExtension(pi: ExtensionAPI): void {
  const refreshShortcut = getShortcutEnv(
    "PI_REFRESH_SHORTCUT",
    DEFAULT_REFRESH_SHORTCUT,
  );

  pi.on("message_end", handleMessageEnd);
  pi.on("context", handleContext);

  pi.registerShortcut(refreshShortcut, {
    description: "Retry the in-progress assistant response",
    handler: (ctx) => {
      if (ctx.isIdle()) {
        ctx.ui.notify("No active response to refresh", "info");
        return;
      }

      if (refreshPending) {
        ctx.ui.notify("Refresh already pending", "info");
        return;
      }

      refreshPending = true;
      ctx.abort();
      scheduleRefreshTrigger(pi, ctx);
      ctx.ui.notify("Refreshing response", "info");
    },
  });
}
