"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/** The recap merged into the Week tab — keep old links working. */
export default function RecapRedirect() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/week");
  }, [router]);
  return null;
}
