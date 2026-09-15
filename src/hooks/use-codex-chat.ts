"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import type { UIMessage } from "@/lib/codex-types";
import type { CodexModelOption, CodexState } from "@/lib/codex-types";
import type { MessageImage } from "@/lib/types";
export function useCodexChat({ scope, initialMessages }: {scope:string;initialMessages:UIMessage[]}) {
  const [messages, setMessages] = useState(initialMessages);
  const [state, setState] = useState<CodexState>();
  const [modelOptions, setModelOptions] = useState<CodexModelOption[]>([]);
  const [error, setError] = useState<Error>();
  const [status, setStatus] = useState<CodexState["status"]>("ready");
  const revision = useRef(0);
  const pollFailures = useRef(0);
  const selectedModelId = state?.modelId && modelOptions.some((option) => option.id === state.modelId)
    ? state.modelId
    : modelOptions[0]?.id || "";
  const friendlyError = (cause: unknown, fallback: string) => {
    if (cause instanceof Error && /failed to fetch|networkerror|load failed/i.test(cause.message)) {
      return new Error(fallback);
    }
    return cause instanceof Error ? cause : new Error(fallback);
  };
  const apply = useCallback((s:CodexState) => {
    pollFailures.current = 0;
    setState(s); setMessages(s.messages); setStatus(s.status); setError(s.error ? new Error(s.error) : undefined);
  },[]);
  const action = useCallback(async (body:object) => {
    revision.current++;
    try {
      const response = await fetch(`/api/codex/${scope}`, {method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)});
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Codex 请求失败");
      revision.current++;
      apply(data); return data as CodexState;
    } catch (cause) {
      const e = friendlyError(cause, "暂时无法连接 Codex，请检查本机服务是否运行。");
      setError(e);
      throw e;
    }
  },[scope,apply]);
  useEffect(() => {
    let alive = true;
    void fetch("/api/codex/config", { cache: "no-store" })
      .then(async (response) => {
        const data = (await response.json()) as { options?: CodexModelOption[]; error?: string };
        if (!response.ok) throw new Error(data.error || "无法读取 Codex 模型配置");
        if (alive) setModelOptions(data.options || []);
      })
      .catch((cause) => {
        if (alive) setError(cause instanceof Error ? cause : new Error("无法读取 Codex 模型配置"));
      });
    return () => { alive = false; };
  }, []);
  useEffect(() => {
    let alive = true; let timer:ReturnType<typeof setTimeout> | undefined; let controller:AbortController | undefined;
    const poll = async () => {
      const version = revision.current;
      controller = new AbortController();
      try {
        const response = await fetch(`/api/codex/${scope}`, {cache:"no-store",signal:controller.signal}); const data = await response.json();
        if (!response.ok) throw new Error(data.error || "无法连接 Codex");
        if (alive && version === revision.current) apply(data);
      } catch(cause) {
        if (alive && !(cause instanceof Error && cause.name === "AbortError")) {
          pollFailures.current += 1;
          if (pollFailures.current >= 3) setError(friendlyError(cause, "暂时无法连接 Codex，请检查本机服务是否运行。"));
        }
      } finally {
        if(alive) timer=setTimeout(poll,800);
      }
    };
    void poll();return()=>{alive=false;if(timer) clearTimeout(timer);controller?.abort();};
  },[scope,apply]);
  const sendMessage = useCallback(async ({text,images=[]}:{text:string;images?:MessageImage[]})=>{
    setStatus("submitted");try {await action({action:"start",text,images,modelId:selectedModelId});}catch{setStatus("error");}
  },[action,selectedModelId]);
  const regenerate = useCallback(async (_options?:{messageId?:string})=>{
    void _options;
    try {
      const response = await fetch(`/api/codex/${scope}`, {cache:"no-store"});
      const current = await response.json();
      if (!response.ok) throw new Error(current.error || "无法加载会话");
      const last = [...(current as CodexState).messages].reverse().find(m=>m.role==="user");
      const text = last?.parts.filter(p=>p.type==="text").map(p=>p.type==="text"?p.text:"").join("");
      const images = last?.parts.filter(p=>p.type==="image") || [];
      if(text || images.length) await action({action:"start",text,images,retry:true,modelId:selectedModelId});
    } catch (cause) {
      const e = friendlyError(cause, "暂时无法连接 Codex，请检查本机服务是否运行。");
      setError(e);
      throw e;
    }
  },[action,scope,selectedModelId]);
  const setModel = useCallback(async (modelId: string) => {
    await action({ action: "model", modelId });
  }, [action]);
  const stop = useCallback(async ()=>{await action({action:"stop"});},[action]);
  const clearError=useCallback(()=>{pollFailures.current=0;setError(undefined);},[]);
  const addToolApprovalResponse=useCallback(async ({id,approved}:{id:string;approved:boolean})=>{await action({action:"respond",id,approved});},[action]);
  return {messages,setMessages,sendMessage,regenerate,status,error,clearError,stop,addToolApprovalResponse,codexState:state,codexAction:action,modelOptions,setModel};
}
