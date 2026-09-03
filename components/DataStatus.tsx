"use client";
import { useEffect, useState } from "react";
import { createClient } from "@/utils/supabase/client";
export default function DataStatus() {
  const [text, setText] = useState("Checking dataset…");
  useEffect(() => {
    let active = true;
    const db = createClient();
    db.from("verified_current_stats")
      .select("season,synced_at")
      .limit(1)
      .then(({ data, error }) => {
        if (active)
          setText(
            error
              ? "Dataset status unavailable."
              : data?.[0]
                ? `NBA Stats · ${data[0].season} regular season · per-game averages · synced ${new Date(data[0].synced_at).toLocaleString("en-US")}`
                : "No verified season snapshot available yet.",
          );
      });
    return () => {
      active = false;
    };
  }, []);
  return <p className="text-xs text-foreground/60 my-3">{text}</p>;
}
