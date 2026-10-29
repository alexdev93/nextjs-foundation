"use client";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

export function ResetOnPathChange({ children }: { children: ReactNode }) {
  return <div key={usePathname()}>{children}</div>;
}
