"use client";

import { Button } from "./ui/button";
import { useRouter } from "next/navigation";

export default function DreamtButton() {
  const router = useRouter();

  return (
    <Button
      className="flex items-center gap-2"
      size="sm"
      onClick={() => router.push("/dreamteam")}
    >
      <svg
        className="h-3 w-3"
        viewBox="0 0 76 65"
        fill="hsl(var(--background)/1)"
        xmlns="http://www.w3.org/2000/svg"
      >
        <path d="M37.5274 0L75.0548 65H0L37.5274 0Z" fill="inherit" />
      </svg>
      <span>Dream Team</span>
    </Button>
  );
}
