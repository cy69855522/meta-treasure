"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  CodexAction,
  CodexModelOption,
  CodexPoll,
  CodexState,
  CodexStatus,
  UIMessage,
} from "@/lib/codex-types";
import type { MessageImage } from "@/lib/types";

const NETWORK_HELP = "暂时无法连接 Codex，请检查本机服务是否运行。";
const BUSY_POLL_MS = 600;
const IDLE_POLL_MS = 2500;
const FAILURES_BEFORE_BANNER = 3;

function toError(cause: unknown, fallback: string) {
  if (cause instanceof Error && /failed to fetch|networkerror|load failed/i.test(cause.message)) {
    return new Error(fallback);
  }
  return cause instanceof Error ? cause : new Error(fallback);
}

const isBusyStatus = (status: CodexStatus) => status === "submitted" || status === "streaming";

/**
 * Client of one Codex conversation.
 *
 * The server owns the truth; this hook mirrors it. State changes only flow
 * through `apply()` (poll or action response), polls ask "anything since rev N?"
 * so idle conversations cost almost nothing, and an action invalidates polls
 * that were already in flight. Every function it returns resolves — failures
 * show up in `error`, never as unhandled rejections.
 */
export function useCodexChat({ scope, initialMessages }: { scope: string; initialMessages: UIMessage[] }) {
  const [messages, setMessages] = useState(initialMessages);
  const [state, setState] = useState<CodexState>();
  const [status, setStatus] = useState<CodexStatus>("ready");
  const [modelOptions, setModelOptions] = useState<CodexModelOption[]>([]);
  // Three independent sources of errors, so a poll can never erase an action's failure.
  const [actionError, setActionError] = useState<Error>();
  const [networkError, setNetworkError] = useState<Error>();
  const [configError, setConfigError] = useState<Error>();
  const [dismissedServerError, setDismissedServerError] = useState<string>();

  const epoch = useRef(0);
  const lastRev = useRef<number | undefined>(undefined);
  const busy = useRef(false);
  const latest = useRef<CodexState | undefined>(undefined);

  const apply = useCallback((next: CodexState) => {
    lastRev.current = next.rev;
    latest.current = next;
    busy.current = isBusyStatus(next.status) || next.requests.length > 0;
    // A new turn deserves to show its own error even if it repeats an old one.
    if (isBusyStatus(next.status)) setDismissedServerError(undefined);
    setState(next);
    setMessages(next.messages);
    setStatus(next.status);
  }, []);

  const run = useCallback(
    async (command: CodexAction): Promise<CodexState | undefined> => {
      epoch.current++;
      setActionError(undefined);
      try {
        const response = await fetch(`/api/codex/${scope}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(command),
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Codex 请求失败");
        epoch.current++;
        apply(data as CodexState);
        return data as CodexState;
      } catch (cause) {
        setActionError(toError(cause, NETWORK_HELP));
        // Drop any optimistic status: the next poll must repaint from the server.
        lastRev.current = undefined;
        return undefined;
      }
    },
    [scope, apply],
  );

  useEffect(() => {
    let alive = true;
    void fetch("/api/codex/config", { cache: "no-store" })
      .then(async (response) => {
        const data = (await response.json()) as { options?: CodexModelOption[]; error?: string };
        if (!response.ok) throw new Error(data.error || "无法读取 Codex 模型配置");
        if (alive) setModelOptions(data.options || []);
      })
      .catch((cause) => {
        if (alive) setConfigError(toError(cause, "无法读取 Codex 模型配置"));
      });
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    let alive = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let controller: AbortController | undefined;
    let failures = 0;
    lastRev.current = undefined;

    const poll = async () => {
      const startedAt = epoch.current;
      controller = new AbortController();
      try {
        const since = lastRev.current;
        const response = await fetch(`/api/codex/${scope}${since === undefined ? "" : `?since=${since}`}`, {
          cache: "no-store",
          signal: controller.signal,
        });
        const data = (await response.json()) as CodexPoll & { error?: string };
        if (!response.ok) throw new Error(data.error || "无法连接 Codex");
        failures = 0;
        if (!alive) return;
        setNetworkError((current) => (current ? undefined : current));
        if (startedAt === epoch.current && !("unchanged" in data)) apply(data);
      } catch (cause) {
        if (alive && !(cause instanceof Error && cause.name === "AbortError")) {
          failures += 1;
          if (failures >= FAILURES_BEFORE_BANNER) setNetworkError(toError(cause, NETWORK_HELP));
        }
      } finally {
        if (alive) timer = setTimeout(poll, busy.current ? BUSY_POLL_MS : IDLE_POLL_MS);
      }
    };
    void poll();
    return () => {
      alive = false;
      if (timer) clearTimeout(timer);
      controller?.abort();
    };
  }, [scope, apply]);

  const selectedModelId =
    state?.modelId && modelOptions.some((option) => option.id === state.modelId)
      ? state.modelId
      : modelOptions[0]?.id || "";

  const sendMessage = useCallback(
    async ({ text, images = [] }: { text: string; images?: MessageImage[] }) => {
      busy.current = true;
      setStatus("submitted");
      const next = await run({ action: "start", text, images, modelId: selectedModelId });
      if (!next) setStatus("error");
    },
    [run, selectedModelId],
  );

  /** Re-run the last user message (after a rewind). */
  const regenerate = useCallback(
    async (_options?: { messageId?: string }) => {
      void _options;
      try {
        const response = await fetch(`/api/codex/${scope}`, { cache: "no-store" });
        const current = (await response.json()) as CodexState & { error?: string };
        if (!response.ok) throw new Error(current.error || "无法加载会话");
        const last = [...current.messages].reverse().find((m) => m.role === "user");
        const text = last?.parts.map((p) => (p.type === "text" ? p.text ?? "" : "")).join("") ?? "";
        const images = last?.parts.filter((p) => p.type === "image") ?? [];
        if (text || images.length) {
          await run({ action: "start", text, images, retry: true, modelId: selectedModelId });
        }
      } catch (cause) {
        setActionError(toError(cause, NETWORK_HELP));
      }
    },
    [scope, run, selectedModelId],
  );

  const setModel = useCallback(
    async (modelId: string) => Boolean(await run({ action: "model", modelId })),
    [run],
  );
  const setDirectory = useCallback(
    async (cwd: string) => Boolean(await run({ action: "directory", cwd })),
    [run],
  );
  const stop = useCallback(async () => {
    await run({ action: "stop" });
  }, [run]);

  /** Answer a pending request; `answers` maps question id to the typed reply. */
  const respond = useCallback(
    async (id: string | number, approved: boolean, answers?: Record<string, string>) =>
      Boolean(
        await run({
          action: "respond",
          id,
          approved,
          answers: answers
            ? Object.fromEntries(Object.entries(answers).map(([key, value]) => [key, { answers: [value] }]))
            : undefined,
        }),
      ),
    [run],
  );

  const clearError = useCallback(() => {
    setActionError(undefined);
    setNetworkError(undefined);
    setConfigError(undefined);
    // A server-side error stays on the session until the next turn; hide it once dismissed.
    setDismissedServerError(latest.current?.error ?? undefined);
  }, []);

  const serverMessage = state?.error ?? undefined;
  const serverError = useMemo(
    () => (serverMessage && serverMessage !== dismissedServerError ? new Error(serverMessage) : undefined),
    [serverMessage, dismissedServerError],
  );
  const error = actionError ?? networkError ?? serverError ?? configError;

  return {
    messages,
    setMessages,
    sendMessage,
    regenerate,
    status,
    error,
    clearError,
    stop,
    respond,
    setDirectory,
    setModel,
    modelOptions,
    codexState: state,
  };
}
