import Image from "next/image";
import type { ImageMessagePart } from "@/lib/codex-types";

export function MessageImages({ images }: { images: ImageMessagePart[] }) {
  if (!images.length) return null;
  return <div className="mb-2 grid max-w-xl grid-cols-2 gap-2 sm:grid-cols-3">{images.map((image) => <a key={image.id} href={image.url} target="_blank" rel="noreferrer" className="relative aspect-square overflow-hidden rounded-lg border bg-background/30"><Image src={image.url} alt={image.name || "消息图片"} fill sizes="(max-width: 640px) 40vw, 180px" unoptimized className="object-cover" /></a>)}</div>;
}
