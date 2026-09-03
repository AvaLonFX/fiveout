"use client";

import { useEffect, useMemo, useRef, useState } from "react";

declare global {
  interface Window {
    YT: any;
    onYouTubeIframeAPIReady: any;
  }
}

type Props = {
  videoId: string;
  startSec: number;
  endSec: number;
  title?: string;
  className?: string;
};

function formatTime(s: number) {
  const m = Math.floor(s / 60);
  const ss = String(Math.floor(s % 60)).padStart(2, "0");
  return `${m}:${ss}`;
}

function loadYouTubeAPI() {
  return new Promise<void>((resolve) => {
    if (window.YT?.Player) return resolve();

    const existing = document.querySelector(
      'script[src="https://www.youtube.com/iframe_api"]'
    );
    if (existing) {
      const prev = window.onYouTubeIframeAPIReady;
      window.onYouTubeIframeAPIReady = () => {
        prev?.();
        resolve();
      };
      return;
    }

    const tag = document.createElement("script");
    tag.src = "https://www.youtube.com/iframe_api";
    document.body.appendChild(tag);
    window.onYouTubeIframeAPIReady = () => resolve();
  });
}

export default function HighlightClipCard({
  videoId,
  startSec,
  endSec,
  title,
  className,
}: Props) {
  const [overlay, setOverlay] = useState(true);

  const playerContainerId = useMemo(
    () => `yt-${Math.random().toString(16).slice(2)}`,
    []
  );

  const playerRef = useRef<any>(null);
  const timerRef = useRef<any>(null);

  const thumbUrl = useMemo(
    () => `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
    [videoId]
  );

  const clearTimer = () => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  };

  const stopAndReset = () => {
    clearTimer();
    try {
      playerRef.current?.pauseVideo?.();
      playerRef.current?.seekTo?.(startSec, true);
    } catch {}
    setOverlay(true);
  };

  // Init player once
  useEffect(() => {
    let cancelled = false;

    (async () => {
      await loadYouTubeAPI();
      if (cancelled) return;

      playerRef.current = new window.YT.Player(playerContainerId, {
        width: "100%",
        height: "100%",
        videoId,
        playerVars: {
          start: startSec,
          autoplay: 0,
          rel: 0,
          modestbranding: 1,
          playsinline: 1,
          iv_load_policy: 3,
        },
        events: {
          onReady: () => {
            try {
              playerRef.current.seekTo(startSec, true);
              // Force iframe size to fill container
              const iframe = playerRef.current.getIframe?.();
              if (iframe) {
                iframe.style.width = "100%";
                iframe.style.height = "100%";
                iframe.style.display = "block";
              }
              // Make sure player knows current size
              playerRef.current.setSize?.(9999, 9999); // YT will clamp to container
            } catch {}
          },
          onStateChange: (e: any) => {
            if (e.data === window.YT.PlayerState.PLAYING) {
              clearTimer();
              timerRef.current = setInterval(() => {
                const t = playerRef.current?.getCurrentTime?.() ?? 0;
                if (t >= endSec - 0.05) {
                  stopAndReset();
                }
              }, 100);
            }
            if (
              e.data === window.YT.PlayerState.PAUSED ||
              e.data === window.YT.PlayerState.ENDED
            ) {
              clearTimer();
            }
          },
        },
      });
    })();

    return () => {
      cancelled = true;
      clearTimer();
      try {
        playerRef.current?.destroy?.();
      } catch {}
      playerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // If props change, re-cue and reset
  useEffect(() => {
    if (!playerRef.current) return;
    stopAndReset();
    try {
      playerRef.current.cueVideoById?.({ videoId, startSeconds: startSec });
      playerRef.current.seekTo?.(startSec, true);
    } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [videoId, startSec, endSec]);

  const onPlay = () => {
    setOverlay(false);
    try {
      playerRef.current.seekTo(startSec, true);
      playerRef.current.playVideo();

      // after toggling overlay, force a resize tick
      setTimeout(() => {
        try {
          const iframe = playerRef.current.getIframe?.();
          if (iframe) {
            iframe.style.width = "100%";
            iframe.style.height = "100%";
            iframe.style.display = "block";
          }
          playerRef.current.setSize?.(9999, 9999);
        } catch {}
      }, 50);
    } catch {}
  };

  return (
    <div className={className}>
      <div className="relative w-full overflow-hidden rounded-xl border bg-black/20">
        {/* Važno: player container uvijek VIDLJIV i ima stvarnu visinu */}
        <div className="w-full aspect-video">
          <div id={playerContainerId} className="w-full h-full" />
        </div>

        {/* Overlay samo prekriva player */}
        {overlay ? (
          <button
            type="button"
            onClick={onPlay}
            className="absolute inset-0 group"
            aria-label="Play highlight"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={thumbUrl}
              alt={title ?? "Highlight"}
              className="w-full h-full object-cover"
              loading="lazy"
            />
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="rounded-full border bg-black/55 px-4 py-2 text-sm text-white backdrop-blur-sm group-hover:bg-black/65">
                ▶ Play clip ({formatTime(endSec - startSec)})
              </div>
            </div>
            <div className="absolute bottom-0 left-0 right-0 p-3 text-left">
              <div className="text-xs text-white/90">
                {formatTime(startSec)} – {formatTime(endSec)}
              </div>
              {title ? (
                <div className="mt-1 line-clamp-1 text-sm font-semibold text-white">
                  {title}
                </div>
              ) : null}
            </div>
          </button>
        ) : (
          <button
            type="button"
            onClick={stopAndReset}
            className="absolute top-2 right-2 rounded-full border bg-black/50 px-3 py-1 text-xs text-white hover:bg-black/60"
          >
            Close
          </button>
        )}
      </div>

      <div className="mt-2 text-xs text-foreground/50">
        Clip: {formatTime(startSec)} – {formatTime(endSec)}
      </div>
    </div>
  );
}
