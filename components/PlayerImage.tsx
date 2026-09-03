"use client";

import { useState, type ImgHTMLAttributes } from "react";
import { usePathname } from "next/navigation";
import { getPlayerImageUrl, PLAYER_IMAGE_FALLBACK } from "@/lib/player-images";

type PlayerImageProps = Omit<ImgHTMLAttributes<HTMLImageElement>, "src" | "alt" | "onError"> & {
  playerId: number | string | null | undefined;
  alt: string;
  imageSize?: "small" | "large";
};

export default function PlayerImage({
  playerId,
  alt,
  imageSize = "large",
  loading = "lazy",
  ...props
}: PlayerImageProps) {
  const pathname = usePathname();
  if (pathname?.startsWith("/full-court")) {
    const initials = alt.trim().split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase() || "FC";
    return <span aria-label={alt} className={`${props.className || ""} inline-flex shrink-0 items-center justify-center rounded-full border border-cyan-300/25 bg-gradient-to-br from-cyan-400/25 to-violet-500/25 text-xs font-black tracking-wide text-white`}>{initials}</span>;
  }
  const source = getPlayerImageUrl(playerId, imageSize);
  const [failedSource, setFailedSource] = useState<string | null>(null);
  const src = failedSource === source ? PLAYER_IMAGE_FALLBACK : source;

  return (
    <img
      width={1040}
      height={760}
      decoding="async"
      {...props}
      src={src}
      alt={alt}
      loading={loading}
      onError={() => {
        if (src !== PLAYER_IMAGE_FALLBACK) setFailedSource(source);
      }}
    />
  );
}
