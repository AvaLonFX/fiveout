"use client";

import Link from "next/link";
import { Button } from "./ui/button";

export default function GuessButton() {
  return (
    <Button asChild className="flex items-center gap-2" size="sm">
      <Link href="/guess">
        <svg
          className="h-3 w-3"
          viewBox="0 0 76 65"
          fill="hsl(var(--background)/1)"
          xmlns="http://www.w3.org/2000/svg"
          aria-hidden="true"
        >
          <path d="M37.5274 0L75.0548 65H0L37.5274 0Z" fill="inherit" />
        </svg>
        <span>Guesser</span>
      </Link>
    </Button>
  );
}
