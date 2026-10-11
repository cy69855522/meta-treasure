"use client";

import { useCallback, useEffect } from "react";
import { ChevronLeft, ChevronRight, ExternalLink, X } from "lucide-react";

export type LightboxImage = {
  url: string;
  name?: string;
};

type Props = {
  images: LightboxImage[];
  currentIndex: number;
  onClose: () => void;
  onNavigate: (index: number) => void;
};

export function ImageLightbox({
  images,
  currentIndex,
  onClose,
  onNavigate,
}: Props) {
  const currentImage = images[currentIndex];
  const hasMultiple = images.length > 1;

  const handlePrev = useCallback(() => {
    if (!hasMultiple) return;
    onNavigate((currentIndex - 1 + images.length) % images.length);
  }, [currentIndex, hasMultiple, images.length, onNavigate]);

  const handleNext = useCallback(() => {
    if (!hasMultiple) return;
    onNavigate((currentIndex + 1) % images.length);
  }, [currentIndex, hasMultiple, images.length, onNavigate]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        handlePrev();
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        handleNext();
      }
    };

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [handlePrev, handleNext, onClose]);

  if (!currentImage) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col items-center justify-between bg-black/85 p-4 backdrop-blur-md transition-opacity duration-200 animate-in fade-in select-none"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="图片放大预览"
    >
      <div
        className="z-10 flex w-full items-center justify-between text-white/90"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3">
          {hasMultiple ? (
            <span className="rounded-full bg-white/10 px-2.5 py-0.5 font-mono text-xs text-white/80 backdrop-blur-xs">
              {currentIndex + 1} / {images.length}
            </span>
          ) : null}
          {currentImage.name ? (
            <span
              className="max-w-xs truncate text-xs font-medium text-white/80 sm:max-w-md md:max-w-lg"
              title={currentImage.name}
            >
              {currentImage.name}
            </span>
          ) : null}
        </div>

        <div className="flex items-center gap-2">
          <a
            href={currentImage.url}
            target="_blank"
            rel="noreferrer"
            className="inline-flex size-8 items-center justify-center rounded-lg bg-white/10 text-white/80 transition hover:bg-white/20 hover:text-white"
            title="在新标签页打开原图"
            aria-label="在新标签页打开原图"
          >
            <ExternalLink className="size-4" />
          </a>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex size-8 items-center justify-center rounded-lg bg-white/10 text-white/80 transition hover:bg-white/20 hover:text-white"
            title="关闭 (Esc)"
            aria-label="关闭预览"
          >
            <X className="size-4" />
          </button>
        </div>
      </div>

      <div
        className="relative flex h-full max-h-[86vh] w-full items-center justify-center py-2"
        onClick={onClose}
      >
        <img
          src={currentImage.url}
          alt={currentImage.name || "放大查看图片"}
          className="max-h-[84vh] max-w-[92vw] rounded-lg object-contain shadow-2xl transition-transform duration-150"
          onClick={(e) => e.stopPropagation()}
        />

        {hasMultiple ? (
          <>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                handlePrev();
              }}
              className="absolute left-2 top-1/2 -translate-y-1/2 rounded-full bg-white/15 p-2 text-white/90 backdrop-blur-md transition hover:bg-white/25 hover:text-white active:scale-95 sm:left-4"
              title="上一张 (←)"
              aria-label="上一张图片"
            >
              <ChevronLeft className="size-6" />
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                handleNext();
              }}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full bg-white/15 p-2 text-white/90 backdrop-blur-md transition hover:bg-white/25 hover:text-white active:scale-95 sm:right-4"
              title="下一张 (→)"
              aria-label="下一张图片"
            >
              <ChevronRight className="size-6" />
            </button>
          </>
        ) : null}
      </div>

      {hasMultiple ? (
        <div
          className="z-10 flex max-w-xl items-center gap-2 overflow-x-auto rounded-xl bg-black/40 px-3 py-1.5 backdrop-blur-xs"
          onClick={(e) => e.stopPropagation()}
        >
          {images.map((img, idx) => (
            <button
              key={`${img.url}-${idx}`}
              type="button"
              onClick={() => onNavigate(idx)}
              className={`relative size-10 shrink-0 overflow-hidden rounded-md border transition ${
                idx === currentIndex
                  ? "border-primary ring-2 ring-primary/60 scale-105"
                  : "border-white/20 opacity-60 hover:opacity-100"
              }`}
            >
              <img
                src={img.url}
                alt={img.name || `缩略图 ${idx + 1}`}
                className="size-full object-cover"
              />
            </button>
          ))}
        </div>
      ) : (
        <div className="h-6" />
      )}
    </div>
  );
}
