"use client";

import { ImagePlus, LoaderCircle, SendHorizontal, X } from "lucide-react";
import Image from "next/image";
import { useEffect, useRef, useState, type DragEvent } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ImageLightbox } from "@/components/image-lightbox";
import { cn } from "@/lib/utils";
import type { MessageImage } from "@/features/deep-radar/lib/research-types";

function dataTransferHasFiles(dt: DataTransfer | null | undefined): boolean {
  if (!dt) return false;
  if (dt.types.includes("Files")) return true;
  return Array.from(dt.items || []).some((item) => item.kind === "file");
}

export function ChatComposer({
  placeholder,
  disabled,
  value,
  onChange,
  onSubmit,
}: {
  placeholder: string;
  disabled?: boolean;
  value: string;
  onChange: (value: string) => void;
  onSubmit: (message: { text: string; images: MessageImage[] }) => void;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dragDepthRef = useRef(0);
  const wasDisabled = useRef(Boolean(disabled));
  const [images, setImages] = useState<MessageImage[]>([]);
  const [uploading, setUploading] = useState(false);
  const [imageError, setImageError] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

  useEffect(() => {
    if (wasDisabled.current && !disabled) ref.current?.focus();
    wasDisabled.current = Boolean(disabled);
  }, [disabled]);

  function submit(e?: React.FormEvent) {
    e?.preventDefault();
    const text = value.trim();
    if ((!text && !images.length) || disabled || uploading) return;
    onSubmit({ text, images });
    onChange("");
    setImages([]);
    setImageError("");
  }

  async function upload(files: File[]) {
    if (!files.length || uploading) return;
    const room = Math.max(0, 9 - images.length);
    const picked = files
      .filter((file) => file.type.startsWith("image/"))
      .slice(0, room);
    if (!picked.length) {
      if (files.length) setImageError("一次最多 9 张图");
      return;
    }
    setUploading(true);
    setImageError("");
    try {
      const body = new FormData();
      for (const file of picked) body.append("files", file);
      const res = await fetch("/api/deep-radar/research/images", {
        method: "POST",
        body,
      });
      const data = (await res.json()) as {
        images?: MessageImage[];
        error?: string;
      };
      if (!res.ok) throw new Error(data.error || "上传失败");
      setImages((current) => [...current, ...(data.images || [])].slice(0, 9));
    } catch (cause) {
      setImageError(cause instanceof Error ? cause.message : "上传失败");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  function onDragEnter(event: DragEvent<HTMLFormElement>) {
    if (!dataTransferHasFiles(event.dataTransfer)) return;
    event.preventDefault();
    event.stopPropagation();
    dragDepthRef.current += 1;
    setDragOver(true);
  }

  function onDragOver(event: DragEvent<HTMLFormElement>) {
    if (!dataTransferHasFiles(event.dataTransfer)) return;
    event.preventDefault();
    event.stopPropagation();
    event.dataTransfer.dropEffect = "copy";
  }

  function onDragLeave(event: DragEvent<HTMLFormElement>) {
    if (!dataTransferHasFiles(event.dataTransfer)) return;
    event.preventDefault();
    event.stopPropagation();
    dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
    if (dragDepthRef.current === 0) setDragOver(false);
  }

  function onDrop(event: DragEvent<HTMLFormElement>) {
    event.preventDefault();
    event.stopPropagation();
    dragDepthRef.current = 0;
    setDragOver(false);
    const files = Array.from(event.dataTransfer.files || []);
    if (files.length) void upload(files);
  }

  return (
    <form
      onSubmit={submit}
      onDragEnter={onDragEnter}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      className={cn(
        "relative shrink-0 border-t border-border bg-background px-4 py-3 md:px-6",
        dragOver && "bg-accent/40",
      )}
    >
      {dragOver ? (
        <div
          className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center rounded-t-xl border-2 border-dashed border-primary/60 bg-background/80 text-sm font-medium text-primary backdrop-blur-sm"
          aria-hidden
        >
          松开以上传图片
        </div>
      ) : null}
      {images.length ? (
        <div className="mb-2 flex flex-wrap gap-2">
          {images.map((image, index) => (
            <div
              key={image.id}
              className="group relative size-16 overflow-hidden rounded-lg border border-border"
            >
              <button
                type="button"
                className="absolute inset-0 cursor-zoom-in"
                onClick={() => setLightboxIndex(index)}
                aria-label={`放大查看 ${image.name}`}
              >
                <Image
                  src={image.url}
                  alt={image.name}
                  fill
                  unoptimized
                  className="object-cover"
                />
              </button>
              <button
                type="button"
                className="absolute right-0.5 top-0.5 z-10 rounded bg-black/55 p-0.5 text-white"
                aria-label="移除图片"
                onClick={() =>
                  setImages((current) =>
                    current.filter((item) => item.id !== image.id),
                  )
                }
              >
                <X className="size-3" />
              </button>
            </div>
          ))}
        </div>
      ) : null}
      {lightboxIndex !== null && images[lightboxIndex] ? (
        <ImageLightbox
          images={images.map((img) => ({ url: img.url, name: img.name }))}
          currentIndex={lightboxIndex}
          onClose={() => setLightboxIndex(null)}
          onNavigate={(index) => setLightboxIndex(index)}
        />
      ) : null}
      {imageError ? (
        <p className="mb-2 text-xs text-destructive">{imageError}</p>
      ) : null}
      <div className="flex items-end gap-2">
        <Textarea
          ref={ref}
          value={value}
          disabled={disabled}
          placeholder={placeholder}
          rows={2}
          className="min-h-[3rem] flex-1 resize-none"
          onChange={(event) => onChange(event.target.value)}
          onPaste={(event) => {
            const files = Array.from(event.clipboardData.items)
              .filter(
                (item) =>
                  item.kind === "file" && item.type.startsWith("image/"),
              )
              .map((item) => item.getAsFile())
              .filter((file): file is File => Boolean(file));
            if (files.length) void upload(files);
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
              event.preventDefault();
              submit();
            }
          }}
        />
        <div className="flex shrink-0 flex-col gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif"
            multiple
            className="hidden"
            onChange={(event) => void upload(Array.from(event.target.files || []))}
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={disabled || uploading || images.length >= 9}
            onClick={() => fileInputRef.current?.click()}
          >
            <ImagePlus />
            {uploading ? "上传中" : `图片 ${images.length}/9`}
          </Button>
          <Button
            type="submit"
            size="lg"
            className="h-12 px-4"
            disabled={disabled || uploading || (!value.trim() && !images.length)}
            aria-label="发送"
          >
            {disabled ? (
              <LoaderCircle className="animate-spin" />
            ) : (
              <SendHorizontal />
            )}
            发送
          </Button>
        </div>
      </div>
    </form>
  );
}
