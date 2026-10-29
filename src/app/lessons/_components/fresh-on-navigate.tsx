// src/app/lessons/_components/fresh-on-navigate.tsx
"use client";

import { useRouter } from "next/navigation";
import type { ReactNode } from "react";

export function FreshOnNavigate({ children }: { children: ReactNode }) {
  const { bfcacheId } = useRouter();
  return <div key={bfcacheId}>{children}</div>;
}
