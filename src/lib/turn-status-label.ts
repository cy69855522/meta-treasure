export function formatWaited(seconds: number) {
  const total = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const secs = total % 60;
  const clock =
    hours > 0
      ? `${hours} 小时 ${minutes} 分 ${secs.toString().padStart(2, "0")} 秒`
      : minutes > 0
        ? `${minutes} 分 ${secs.toString().padStart(2, "0")} 秒`
        : `${secs} 秒`;
  return `已等待 ${clock}`;
}

export function turnStatusLabel(status: string, elapsedSeconds: number | null) {
  const waited = elapsedSeconds == null ? "" : ` ${formatWaited(elapsedSeconds)}`;
  if (status === "submitted") return `已发送，等待模型推理…${waited}`;
  if (status === "streaming") return `模型推理中，正在流式回复…${waited}`;
  return null;
}
