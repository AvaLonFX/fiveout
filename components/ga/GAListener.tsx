"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { pageview } from "@/lib/gtag";

export default function GAListener() {
  const pathname = usePathname();

  useEffect(() => {
    pageview(pathname);
  }, [pathname]);

  return null;
}
