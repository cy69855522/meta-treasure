/** Map LLM / gateway failures to a short Chinese message for the chat UI. */
export function formatLlmError(error: unknown): string {
  const raw =
    error instanceof Error
      ? `${error.message}\n${error.cause instanceof Error ? error.cause.message : ""}`
      : String(error);
  const text = raw.toLowerCase();

  if (
    text.includes("connect timeout") ||
    text.includes("und_err_connect_timeout") ||
    text.includes("failed to connect") ||
    text.includes("timeout was reached")
  ) {
    return "无法连接语言模型网关（连接超时）。请检查网络或 BBOLUO_BASE_URL 是否可达，稍后再试。";
  }
  if (
    text.includes("enotfound") ||
    text.includes("getaddrinfo") ||
    text.includes("could not resolve")
  ) {
    return "无法解析语言模型网关域名。请检查 BBOLUO_BASE_URL / DNS。";
  }
  if (
    text.includes("econnreset") ||
    text.includes("socket hang up") ||
    text.includes("connection reset")
  ) {
    return "与语言模型网关的连接被重置。请稍后再试。";
  }
  if (text.includes("maxretriesexceeded") || text.includes("failed after")) {
    return "调用语言模型多次重试仍失败。多半是网关不可达或超时，请稍后再试。";
  }
  if (text.includes("401") || text.includes("unauthorized")) {
    return "语言模型鉴权失败。请检查 BBOLUO_API_KEY。";
  }
  if (text.includes("429") || text.includes("rate limit")) {
    return "语言模型请求过于频繁，请稍后再试。";
  }

  if (error instanceof Error && error.message.trim()) {
    // Avoid leaking the SDK's useless default if it somehow arrives here.
    if (/^an error occurred\.?$/i.test(error.message.trim())) {
      return "调用语言模型失败，请查看服务端日志。";
    }
    return error.message;
  }
  return "调用语言模型失败，请查看服务端日志。";
}
