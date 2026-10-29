"use client"

import { usePathname } from "next/navigation"
import { useEffect } from "react"

export function PageView() {
  const pathname = usePathname()

  useEffect(() => {
    // Runs once per template mount, i.e. once per page navigation.
    console.log(`[page-view] ${pathname} at ${new Date().toLocaleTimeString()}`)
    return () => console.log(`[page-view] leaving ${pathname}`)
  }, [pathname])

  return null
}
