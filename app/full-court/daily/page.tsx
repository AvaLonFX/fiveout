import type { Metadata } from "next";
import DailyBeatChallenge from "@/components/DailyBeatChallenge";

export const metadata: Metadata = { title: "Daily Challenge", description: "Build within the budget and beat today's FIVEOUT team." };

export default function DailyChallengePage() {
  return <main className="mx-auto max-w-7xl px-4 py-8 sm:px-5"><DailyBeatChallenge /></main>;
}
