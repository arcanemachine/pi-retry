import { beforeEach, describe, expect, it, vi } from "vitest";
import type {
  ExtensionAPI,
  ExtensionContext,
} from "@earendil-works/pi-coding-agent";

type Listener = (event: any) => unknown;
type ShortcutHandler = (ctx: ExtensionContext) => unknown;

function createContext(options: { idle: boolean }) {
  let idle = options.idle;

  const ctx = {
    isIdle: vi.fn(() => idle),
    abort: vi.fn(),
    ui: {
      notify: vi.fn(),
    },
  } as unknown as ExtensionContext;

  return {
    ctx,
    setIdle(value: boolean) {
      idle = value;
    },
  };
}

async function createHarness() {
  vi.resetModules();

  const listeners = new Map<string, Listener[]>();
  let shortcut:
    | { key: string; handler: ShortcutHandler; description?: string }
    | undefined;

  const pi = {
    on: vi.fn((event: string, handler: Listener) => {
      const handlers = listeners.get(event) ?? [];
      handlers.push(handler);
      listeners.set(event, handlers);
    }),
    registerShortcut: vi.fn(
      (
        key: string,
        options: { description?: string; handler: ShortcutHandler },
      ) => {
        shortcut = {
          key,
          description: options.description,
          handler: options.handler,
        };
      },
    ),
    sendMessage: vi.fn(),
  } as unknown as ExtensionAPI;

  const extension = (await import("../src/index.js")).default;
  extension(pi);

  if (!shortcut) throw new Error("shortcut was not registered");

  return {
    pi,
    listeners,
    shortcut,
    emit(event: string, payload: any) {
      return listeners.get(event)?.map((handler) => handler(payload)) ?? [];
    },
  };
}

describe("pi-retry-response", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    delete process.env.PI_RETRY_RESPONSE_SHORTCUT;
    delete process.env.PI_REFRESH_SHORTCUT;
  });

  it("registers the retry shortcut", async () => {
    const { pi, shortcut } = await createHarness();

    expect(pi.registerShortcut).toHaveBeenCalledTimes(1);
    expect(shortcut.key).toBe("ctrl+alt+r");
    expect(shortcut.description).toBe(
      "Retry the in-progress assistant response",
    );
  });

  it("allows the shortcut to be overridden by environment", async () => {
    process.env.PI_RETRY_RESPONSE_SHORTCUT = "ctrl+x";

    const { shortcut } = await createHarness();

    expect(shortcut.key).toBe("ctrl+x");
  });

  it("supports legacy PI_REFRESH_SHORTCUT", async () => {
    process.env.PI_REFRESH_SHORTCUT = "ctrl+y";

    const { shortcut } = await createHarness();

    expect(shortcut.key).toBe("ctrl+y");
  });

  it("does not retry when the agent is idle", async () => {
    const { pi, shortcut } = await createHarness();
    const { ctx } = createContext({ idle: true });

    shortcut.handler(ctx);
    await vi.runAllTimersAsync();

    expect(ctx.abort).not.toHaveBeenCalled();
    expect(pi.sendMessage).not.toHaveBeenCalled();
    expect(ctx.ui.notify).toHaveBeenCalledWith(
      "No active response to retry",
      "info",
    );
  });

  it("aborts an active response and sends a hidden trigger after idle", async () => {
    const { pi, shortcut } = await createHarness();
    const harnessCtx = createContext({ idle: false });

    shortcut.handler(harnessCtx.ctx);
    harnessCtx.setIdle(true);
    await vi.advanceTimersByTimeAsync(50);

    expect(harnessCtx.ctx.abort).toHaveBeenCalledTimes(1);
    expect(pi.sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        customType: "pi-retry-response:trigger",
        content: "",
        display: false,
      }),
      { triggerTurn: true },
    );
  });

  it("strips the aborted assistant response and hidden trigger from provider context", async () => {
    const { shortcut, emit } = await createHarness();
    const harnessCtx = createContext({ idle: false });

    shortcut.handler(harnessCtx.ctx);
    emit("message_end", {
      type: "message_end",
      message: {
        role: "assistant",
        content: [],
        stopReason: "aborted",
        timestamp: 123,
      },
    });

    const [result] = emit("context", {
      type: "context",
      messages: [
        {
          role: "user",
          content: [{ type: "text", text: "original prompt" }],
          timestamp: 1,
        },
        {
          role: "assistant",
          content: [],
          stopReason: "aborted",
          timestamp: 123,
        },
        {
          role: "custom",
          customType: "pi-retry-response:trigger",
          content: "",
          display: false,
          timestamp: 456,
        },
      ],
    });

    expect(result).toEqual({
      messages: [
        {
          role: "user",
          content: [{ type: "text", text: "original prompt" }],
          timestamp: 1,
        },
      ],
    });
  });
});
