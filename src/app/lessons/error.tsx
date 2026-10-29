"use client";

import { useEffect } from "react";

export default function ErrorPage() {
  useEffect(() => {
    console.error("An error occurred while rendering the page.");
  }, []);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4">
      <h1 className="text-4xl font-bold">Something went wrong</h1>
      <p className="text-lg text-muted-foreground">
        An unexpected error occurred while rendering the page. Please try again
        later.
      </p>
    </div>
  );
}
