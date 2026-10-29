"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";

// Logs mount/unmount and holds a counter, so you can see which wrapper keeps its state.
export function LifecycleLogger({ label }: { label: "layout" | "template" }) {
  // Generated after mount: Math.random() during render would be frozen into the prerender.

  const pathname = usePathname();
  const [instanceId, setInstanceId] = useState<string | null>(null);
  const [count, setCount] = useState(0);

  const idRef = useRef<string | null>(null);

  useEffect(() => {
    idRef.current ??= Math.random().toString(36).slice(2, 6);
    const id = idRef.current;
    setInstanceId(id);
    console.log(`[${label}] mount ${pathname}  #${id} counts ${count}`);
    return () => console.log(`[${label}] unmount ${pathname} #${id} ${count}`);
  }, [label]);

  return (
    <button
      type="button"
      onClick={() => setCount((c) => c + 1)}
      className="rounded border px-2 py-1 font-mono text-xs"
    >
      {label} #{instanceId ?? "····"} ${pathname} · clicks: {count}
    </button>
  );
}
