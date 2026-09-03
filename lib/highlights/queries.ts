import { supabaseServer } from "@/lib/supabaseServer";

function todayISO() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

export async function getBestHighlightForDay(day = todayISO()) {
  const supabase = supabaseServer();

  // 1) nađi daily video
  const { data: daily, error: e1 } = await supabase
    .from("yt_daily_videos")
    .select("id, day, youtube_video_id, title")
    .eq("day", day)
    .single();

  if (e1 || !daily) return { daily: null, best: null };

  // 2) join: clips -> highlights, best score
  const { data: rows } = await supabase
    .from("yt_video_clips")
    .select(
      `
      id, rank, start_sec, end_sec,
      player_highlights ( id, person_id, event, score, event_conf, player_conf )
    `
    )
    .eq("daily_video_id", daily.id);

  if (!rows) return { daily, best: null };

  // flatten
  const candidates = rows
    .map((c: any) => {
      const h = c.player_highlights?.[0];
      if (!h) return null;
      return {
        clip_id: c.id,
        rank: c.rank,
        start_sec: c.start_sec,
        end_sec: c.end_sec,
        youtube_video_id: daily.youtube_video_id,
        daily_title: daily.title,
        ...h,
      };
    })
    .filter(Boolean) as any[];

  if (candidates.length === 0) return { daily, best: null };

  candidates.sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
  const best = candidates[0];

  // 3) fetch player name from Osnovno_NBA (optional)
  let player = null;
  if (best.person_id) {
    const { data: p } = await supabase
      .from("Osnovno_NBA")
      .select("PERSON_ID, player_full_name, TEAM_ABBREVIATION")
      .eq("PERSON_ID", best.person_id)
      .limit(1)
      .maybeSingle();
    player = p;
  }

  return { daily, best: { ...best, player } };
}

export async function getHighlightsForPlayer(personId: number, limit = 20) {
  const supabase = supabaseServer();

  // Highlights by person_id
  const { data: highlights } = await supabase
    .from("player_highlights")
    .select("id, clip_id, event, score, created_at")
    .eq("person_id", personId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (!highlights || highlights.length === 0) return [];

  const clipIds = highlights.map((h) => h.clip_id);

  // Fetch clips + youtube_video_id via join
  const { data: clips } = await supabase
    .from("yt_video_clips")
    .select(
      `
      id, start_sec, end_sec, daily_video_id,
      yt_daily_videos ( youtube_video_id, day, title )
    `
    )
    .in("id", clipIds);

  const clipMap = new Map<number, any>();
  (clips ?? []).forEach((c: any) => clipMap.set(c.id, c));

  // Player meta
  const { data: player } = await supabase
    .from("Osnovno_NBA")
    .select("PERSON_ID, player_full_name, TEAM_ABBREVIATION, TEAM_NAME")
    .eq("PERSON_ID", personId)
    .limit(1)
    .maybeSingle();

  return highlights
    .map((h: any) => {
      const c = clipMap.get(h.clip_id);
      return {
        ...h,
        player,
        youtube_video_id: c?.yt_daily_videos?.youtube_video_id,
        day: c?.yt_daily_videos?.day,
        daily_title: c?.yt_daily_videos?.title,
        start_sec: c?.start_sec,
        end_sec: c?.end_sec,
      };
    })
    .filter((x) => x.youtube_video_id);
}
