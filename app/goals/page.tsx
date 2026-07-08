"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/** Goals merged into the Week tab — keep old links working. */
export default function GoalsRedirect() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/week");
  }, [router]);
  return null;
}
