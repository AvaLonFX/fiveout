"use client";

import { useRef, useState } from "react";
import PlayerImage from "@/components/PlayerImage";
import { useRouter } from "next/navigation";
import { supabase } from "../../lib/supabase";
import { updateSearchCount } from "../../app/api/updateSearch";
import { trackInteraction } from "@/lib/trackInteraction";

interface SearchPlayersProps {
  onPlayerClick?: (player: any) => void; // dobije cijeli player objekt
  onPlayerSelect?: (playerId: string) => void;
  inputTextColor?: string; // npr. "black" samo za guess igru
}

export default function SearchPlayers({
  onPlayerClick,
  onPlayerSelect,
  inputTextColor,
}: SearchPlayersProps) {
  const [searchTerm, setSearchTerm] = useState<string>("");
  const [players, setPlayers] = useState<any[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState("");
  const [hoveredPlayer, setHoveredPlayer] = useState<any | null>(null);
  const [cursorPosition, setCursorPosition] = useState<{
    x: number;
    y: number;
  }>({
    x: 0,
    y: 0,
  });
  const router = useRouter();
  const searchVersion = useRef(0);

  const handleSearch = async (term: string) => {
    setSearchTerm(term);
    const version = ++searchVersion.current;
    setSearchError("");
    setSearching(true);
    const query = term
      .replace(new RegExp("[^\\p{L}\\p{N} .'-]", "gu"), "")
      .trim()
      .slice(0, 64);

    if (!query) {
      setPlayers([]);
      setSearching(false);
      return;
    }

    try {
      const { data, error } = await supabase
        .from("Osnovno_NBA")
        .select("*")
        .or(
          `PLAYER_FIRST_NAME.ilike.%${query}%,PLAYER_LAST_NAME.ilike.%${query}%,player_full_name.ilike.%${query}%`,
        )
        .limit(5);

      if (error) {
        if (version === searchVersion.current) {
          setSearchError(
            "Search is temporarily unavailable. Please try again.",
          );
          setPlayers([]);
        }
        console.error("Error fetching players:", error);
        return;
      }

      if (version === searchVersion.current) setPlayers(data || []);
    } catch (err) {
      if (version === searchVersion.current)
        setSearchError("Unable to search. Check your connection and retry.");
      console.error("Unexpected error:", err);
    } finally {
      if (version === searchVersion.current) setSearching(false);
    }
  };

  const handlePlayerClick = async (player: any) => {
    searchVersion.current++;
    setSearchTerm("");
    setPlayers([]);
    setHoveredPlayer(null);
    setSearching(false);
    void updateSearchCount(player.PERSON_ID).catch(() => {});
    void trackInteraction({
      itemType: "player",
      itemId: player.PERSON_ID,
      eventType: "search_click",
      weight: 2,
    }).catch(() => {});

    // 1) Pošalji cijeli objekt (za guess history itd.)
    if (onPlayerClick) {
      onPlayerClick(player);
    }

    // 2) Pošalji ID (za logiku pogođeno / nije pogođeno)
    if (onPlayerSelect) {
      onPlayerSelect(player.PERSON_ID);
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    setCursorPosition({ x: e.clientX, y: e.clientY });
  };

  const handleMouseEnter = (player: any) => {
    setHoveredPlayer(player);
  };

  const handleMouseLeave = () => {
    setHoveredPlayer(null);
  };

  return (
    <div style={{ padding: "20px" }} onMouseMove={handleMouseMove}>
      <input
        type="text"
        placeholder="Search for players..."
        value={searchTerm}
        onChange={(e) => handleSearch(e.target.value)}
        style={{
          width: "100%",
          padding: "10px",
          fontSize: "16px",
          marginBottom: "20px",
          border: "1px solid #ccc",
          borderRadius: "5px",
          color: inputTextColor ?? "inherit", // 👈 ovdje mijenjamo boju teksta
        }}
      />
      {searching && <p role="status">Searching…</p>}
      {searchError && <p role="alert">{searchError}</p>}
      {players.length > 0 ? (
        <ul style={{ listStyleType: "none", padding: "0" }}>
          {players.map((player) => (
            <li
              key={player.PERSON_ID}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  void handlePlayerClick(player);
                }
              }}
              style={{
                marginBottom: "10px",
                cursor: "pointer",
                textDecoration: "bold",
                color: "white",
                padding: "10px",
                border: "1px solid #ccc",
                borderRadius: "5px",
                backgroundColor: "#1a1a1a",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                transition:
                  "background-color 0.3s ease, border-color 0.3s ease",
              }}
              onClick={() => {
                handlePlayerClick(player);
              }}
              onMouseEnter={() => handleMouseEnter(player)}
              onMouseLeave={handleMouseLeave}
              onMouseOver={(e) =>
                (e.currentTarget.style.backgroundColor = "#333")
              }
              onMouseOut={(e) =>
                (e.currentTarget.style.backgroundColor = "#1a1a1a")
              }
            >
              <div>
                {player.PLAYER_FIRST_NAME} {player.PLAYER_LAST_NAME} -{" "}
                {player.TEAM_NAME || "No Team"}
              </div>
              <div>
                {player.TEAM_ID && (
                  <img
                    src={`https://cdn.nba.com/logos/nba/${player.TEAM_ID}/global/L/logo.svg`}
                    alt={`${player.TEAM_NAME} logo`}
                    style={{
                      width: "30px",
                      height: "30px",
                      objectFit: "contain",
                      marginLeft: "10px",
                    }}
                    onError={(e) => (e.currentTarget.style.display = "none")}
                  />
                )}
              </div>
            </li>
          ))}
        </ul>
      ) : (
        searchTerm && !searching && !searchError && <p>No players found.</p>
      )}
      {hoveredPlayer && (
        <div
          style={{
            position: "fixed",
            top: `${cursorPosition.y + 10}px`,
            left: `${cursorPosition.x + 10}px`,
            background: "#fff",
            padding: "10px",
            border: "1px solid #ccc",
            borderRadius: "5px",
            boxShadow: "0px 4px 8px rgba(0,0,0,0.2)",
            zIndex: 1000,
          }}
        >
          <PlayerImage
            playerId={hoveredPlayer.PERSON_ID}
            alt={`${hoveredPlayer.PLAYER_FIRST_NAME} ${hoveredPlayer.PLAYER_LAST_NAME}`}
            style={{
              width: "200px",
              height: "200px",
              objectFit: "cover",
              marginBottom: "10px",
            }}
            loading="lazy"
          />
          <p style={{ margin: 0, fontSize: "14px", fontWeight: "bold" }}>
            {hoveredPlayer.PLAYER_FIRST_NAME} {hoveredPlayer.PLAYER_LAST_NAME}
          </p>
        </div>
      )}
    </div>
  );
}
