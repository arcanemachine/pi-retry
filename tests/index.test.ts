import { beforeEach, describe, expect, it, vi, afterEach } from "vitest";
import type {
  ExtensionAPI,
  ExtensionContext,
} from "@earendil-works/pi-coding-agent";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import * as os from "node:os";
import { join } from "node:path";

type Listener = (event: any) => unknown;
type ShortcutHandler = (ctx: ExtensionContext) => unknown;

function createContext(options: {
  idle: boolean;
  pendingMessages?: boolean;
  editorText?: string;
  leafEntry?: unknown;
}) {
  let idle = options.idle;
  let pendingMessages = options.pendingMessages ?? false;
  let editorText = options.editorText ?? "";
  let leafEntry = options.leafEntry;

  const ctx = {
    isIdle: vi.fn(() => idle),
    hasPendingMessages: vi.fn(() => pendingMessages),
    abort: vi.fn(),
    sessionManager: {
      getLeafEntry: vi.fn(() => leafEntry),
    },
    ui: {
      notify: vi.fn(),
      getEditorText: vi.fn(() => editorText),
    },
  } as unknown as ExtensionContext;

  return {
    ctx,
    setIdle(value: boolean) {
      idle = value;
    },
    setPendingMessages(value: boolean) {
      pendingMessages = value;
    },
    setEditorText(value: string) {
      editorText = value;
    },
    setLeafEntry(value: unknown) {
      leafEntry = value;
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

describe("pi-retry", () => {
  let testDir: string;
  let originalCwd: string;
  let originalHome: string | undefined;

  beforeEach(() => {
    vi.useFakeTimers();
    originalCwd = process.cwd();
    testDir = mkdtempSync(join(os.tmpdir(), "pi-retry-test-"));
    originalHome = process.env.HOME;
    process.chdir(testDir);
  });

  afterEach(() => {
    process.chdir(originalCwd);
    if (originalHome === undefined) {
      delete process.env.HOME;
    } else {
      process.env.HOME = originalHome;
    }
    rmSync(testDir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  it("registers the retry shortcut", async () => {
    const { pi, shortcut } = await createHarness();

    expect(pi.registerShortcut).toHaveBeenCalledTimes(1);
    expect(shortcut.key).toBe("ctrl+alt+r");
    expect(shortcut.description).toBe(
      "Retry the in-progress assistant response",
    );
  });

  it("allows the shortcut to be overridden by project settings", async () => {
    mkdirSync(join(testDir, ".pi"), { recursive: true });
    writeFileSync(
      join(testDir, ".pi", "settings.json"),
      JSON.stringify({ "pi-retry": { shortcut: "ctrl+x" } }),
    );

    const { shortcut } = await createHarness();

    expect(shortcut.key).toBe("ctrl+x");
  });

  it("supports global settings", async () => {
    const fakeHome = mkdtempSync(join(os.tmpdir(), "pi-retry-home-"));
    mkdirSync(join(fakeHome, ".pi", "agent"), { recursive: true });
    writeFileSync(
      join(fakeHome, ".pi", "agent", "settings.json"),
      JSON.stringify({ "pi-retry": { shortcut: "ctrl+y" } }),
    );
    process.env.HOME = fakeHome;

    const { shortcut } = await createHarness();

    expect(shortcut.key).toBe("ctrl+y");
    rmSync(fakeHome, { recursive: true, force: true });
  });

  it("sends a trigger turn when idle without an aborted assistant leaf", async () => {
    const { pi, shortcut } = await createHarness();
    const { ctx } = createContext({ idle: true });

    shortcut.handler(ctx);
    await vi.advanceTimersByTimeAsync(50);

    expect(ctx.abort).not.toHaveBeenCalled();
    expect(pi.sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        customType: "pi-retry:trigger",
        content: "",
        display: false,
        details: expect.objectContaining({
          action: "resume",
          suppressAssistantTimestamp: undefined,
        }),
      }),
      { triggerTurn: true },
    );
    expect(ctx.ui.notify).toHaveBeenCalledWith(
      "Resuming stopped response (from last full reply)",
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
        customType: "pi-retry:trigger",
        content: "",
        display: false,
      }),
      { triggerTurn: true },
    );
  });

  it("resumes an aborted assistant leaf when idle", async () => {
    const { pi, shortcut } = await createHarness();
    const { ctx } = createContext({
      idle: true,
      leafEntry: {
        type: "message",
        message: {
          role: "assistant",
          content: [],
          stopReason: "aborted",
          timestamp: 789,
        },
      },
    });

    shortcut.handler(ctx);
    await vi.advanceTimersByTimeAsync(50);

    expect(ctx.abort).not.toHaveBeenCalled();
    expect(pi.sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        customType: "pi-retry:trigger",
        content: "",
        display: false,
        details: expect.objectContaining({
          action: "resume",
          suppressAssistantTimestamp: 789,
        }),
      }),
      { triggerTurn: true },
    );
    expect(ctx.ui.notify).toHaveBeenCalledWith(
      "Resuming stopped response (from last full reply)",
      "info",
    );
  });

  it("does not resume when idle and pending messages exist", async () => {
    const { pi, shortcut } = await createHarness();
    const { ctx } = createContext({
      idle: true,
      pendingMessages: true,
      leafEntry: {
        type: "message",
        message: {
          role: "assistant",
          content: [],
          stopReason: "aborted",
          timestamp: 789,
        },
      },
    });

    shortcut.handler(ctx);
    await vi.runAllTimersAsync();

    expect(pi.sendMessage).not.toHaveBeenCalled();
    expect(ctx.ui.notify).toHaveBeenCalledWith(
      "Resume skipped: pending messages queued",
      "info",
    );
  });

  it("does not resume when editor has unsent text", async () => {
    const { pi, shortcut } = await createHarness();
    const { ctx } = createContext({
      idle: true,
      editorText: "draft",
      leafEntry: {
        type: "message",
        message: {
          role: "assistant",
          content: [],
          stopReason: "aborted",
          timestamp: 789,
        },
      },
    });

    shortcut.handler(ctx);
    await vi.runAllTimersAsync();

    expect(pi.sendMessage).not.toHaveBeenCalled();
    expect(ctx.ui.notify).toHaveBeenCalledWith(
      "Resume skipped: editor has unsent text",
      "info",
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
          customType: "pi-retry:trigger",
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
