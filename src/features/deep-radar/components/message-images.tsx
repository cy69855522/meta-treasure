"use client";

import { useState } from "react";
import Image from "next/image";
import type { MessageImage } from "@/features/deep-radar/lib/research-types";
import { ImageLightbox } from "@/components/image-lightbox";

export function MessageImages({ images }: { images?: MessageImage[] }) {
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

  if (!images?.length) return null;

  return (
    <>
      <div className="mb-2 grid max-w-xl grid-cols-2 gap-2 sm:grid-cols-3">
        {images.map((image, index) => (
          <button
            key={image.id}
            type="button"
            onClick={() => setLightboxIndex(index)}
            className="group relative aspect-square cursor-zoom-in overflow-hidden rounded-lg border bg-background/30 text-left transition hover:brightness-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            aria-label={`放大查看图片 ${image.name || index + 1}`}
          >
            <Image
              src={image.url}
              alt={image.name || "消息图片"}
              fill
              sizes="(max-width: 640px) 40vw, 180px"
              unoptimized
              className="object-cover transition-transform duration-200 group-hover:scale-105"
            />
          </button>
        ))}
      </div>

      {lightboxIndex !== null ? (
        <ImageLightbox
          images={images.map((img) => ({ url: img.url, name: img.name }))}
          currentIndex={lightboxIndex}
          onClose={() => setLightboxIndex(null)}
          onNavigate={(index) => setLightboxIndex(index)}
        />
      ) : null}
    </>
  );
}
