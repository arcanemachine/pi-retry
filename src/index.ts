import type {
  ContextEvent,
  ExtensionAPI,
  ExtensionContext,
  ExtensionEvent,
} from "@earendil-works/pi-coding-agent";
type Shortcut = Parameters<ExtensionAPI["registerShortcut"]>[0];
type ContextMessage = ContextEvent["messages"][number];
type MessageEndEvent = Extract<ExtensionEvent, { type: "message_end" }>;

const DEFAULT_RETRY_SHORTCUT = "ctrl+alt+r" as Shortcut;
const RETRY_TRIGGER_TYPE = "pi-retry-response:trigger";
const TRIGGER_RETRY_DELAY_MS = 50;
const TRIGGER_RETRY_ATTEMPTS = 100;

let retryPending = false;
let triggerPending = false;
const suppressedAssistantTimestamps = new Set<number>();

function getShortcut(): Shortcut {
  const preferred = process.env.PI_RETRY_RESPONSE_SHORTCUT?.trim();
  if (preferred) return preferred as Shortcut;

  const legacy = process.env.PI_REFRESH_SHORTCUT?.trim();
  if (legacy) return legacy as Shortcut;

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

      scheduleRetryTrigger(pi, ctx, attempt + 1);
      return;
    }

    triggerPending = true;
    pi.sendMessage(
      {
        customType: RETRY_TRIGGER_TYPE,
        content: "",
        display: false,
        details: { timestamp: Date.now() },
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
  const retryShortcut = getShortcut();

  pi.on("message_end", handleMessageEnd);
  pi.on("context", handleContext);

  pi.registerShortcut(retryShortcut, {
    description: "Retry the in-progress assistant response",
    handler: (ctx) => {
      if (ctx.isIdle()) {
        ctx.ui.notify("No active response to retry", "info");
        return;
      }

      if (retryPending) {
        ctx.ui.notify("Retry already pending", "info");
        return;
      }

      retryPending = true;
      ctx.abort();
      scheduleRetryTrigger(pi, ctx);
      ctx.ui.notify("Retrying response", "info");
    },
  });
}
