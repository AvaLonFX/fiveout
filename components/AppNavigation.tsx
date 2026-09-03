"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
const groups = [
  {
    label: "Explore",
    items: [
      ["/", "Home"],
      ["/dashboard", "Player explorer"],
      ["/teams", "NBA teams"],
      ["/currentstats", "Season stats"],
      ["/alltimestats", "Historical stats"],
    ],
  },
  {
    label: "Games",
    items: [
      ["/guess", "Guesser"],
      ["/daily-five", "Daily Five"],
      ["/history", "Results & achievements"],
    ],
  },
  {
    label: "My players & teams",
    items: [
      ["/dreamteam", "Dream Team"],
      ["/matchups", "Match simulator"],
      ["/matches", "Match history"],
      ["/profile", "Arena profile"],
      ["/watchlist", "Watchlist"],
    ],
  },
];
export default function AppNavigation() {
  const pathname = usePathname();
  return (
    <div className="space-y-5">
      {groups.map((g) => (
        <section key={g.label}>
          <h2 className="px-3 mb-2 text-xs uppercase tracking-wide text-foreground/50">
            {g.label}
          </h2>
          <div className="space-y-1">
            {g.items.map(([href, label]) => (
              <Link
                key={href}
                href={href}
                aria-current={pathname === href ? "page" : undefined}
                className={`block rounded-xl px-3 py-2 text-sm font-semibold transition ${pathname === href ? "bg-foreground/10 text-foreground" : "text-foreground/70 hover:bg-foreground/5"}`}
              >
                {label}
              </Link>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
