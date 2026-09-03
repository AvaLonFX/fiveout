"use client";

import { useEffect, useRef } from "react";

declare global {
  interface Window {
    YT: any;
    onYouTubeIframeAPIReady: any;
  }
}

export default function HighlightPlayer({
  videoId,
  startSec,
  endSec,
}: {
  videoId: string;
  startSec: number;
  endSec: number;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<any>(null);
  const timerRef = useRef<any>(null);

  useEffect(() => {
    const load = () =>
      new Promise<void>((resolve) => {
        if (window.YT?.Player) return resolve();
        const tag = document.createElement("script");
        tag.src = "https://www.youtube.com/iframe_api";
        document.body.appendChild(tag);
        window.onYouTubeIframeAPIReady = () => resolve();
      });

    let cancelled = false;

    (async () => {
      await load();
      if (cancelled || !containerRef.current) return;

      playerRef.current = new window.YT.Player(containerRef.current, {
        videoId,
        playerVars: { start: startSec, rel: 0, modestbranding: 1 },
        events: {
          onStateChange: (e: any) => {
            if (e.data === window.YT.PlayerState.PLAYING) {
              if (timerRef.current) clearInterval(timerRef.current);
              timerRef.current = setInterval(() => {
                const t = playerRef.current?.getCurrentTime?.() ?? 0;
                if (t >= endSec) {
                  playerRef.current.pauseVideo();
                  clearInterval(timerRef.current);
                }
              }, 200);
            }
          },
        },
      });
    })();

    return () => {
      cancelled = true;
      if (timerRef.current) clearInterval(timerRef.current);
      if (playerRef.current?.destroy) playerRef.current.destroy();
    };
  }, [videoId, startSec, endSec]);

  return <div ref={containerRef} />;
}
