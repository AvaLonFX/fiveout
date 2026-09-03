export const PLAYER_IMAGE_FALLBACK = "/images/player-placeholder.svg";

/** Central source switch for player portraits; CDN access does not grant usage rights. */
export function getPlayerImageUrl(
  playerId: number | string | null | undefined,
  size: "small" | "large" = "large",
): string {
  const id = String(playerId ?? "");
  if (!/^[1-9]\d*$/.test(id)) return PLAYER_IMAGE_FALLBACK;
  const dimensions = size === "small" ? "260x190" : "1040x760";
  return `https://cdn.nba.com/headshots/nba/latest/${dimensions}/${id}.png`;
}
