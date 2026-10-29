import Link from "next/link";
import type { ReactNode } from "react";

import { FreshOnNavigate } from "./_components/fresh-on-navigate";
import { LifecycleLogger } from "./_components/lifecycle-logger";
import { LESSONS } from "./_data/lessons";

export default function LessonLayout({
  children,
}: Readonly<{ children: ReactNode }>) {
  return (
    <div className="flex flex-col gap-6">
      <nav className="flex flex-wrap items-center gap-4 text-sm">
        <Link href="/lessons">All lessons</Link>
        {LESSONS.map((lesson) => (
          <Link key={lesson.slug} href={`/lessons/${lesson.slug}`}>
            {lesson.title}
          </Link>
        ))}
        <Link href="/lessons/templates?tab=notes">Templates (?tab=notes)</Link>
        <FreshOnNavigate>
          <LifecycleLogger label="layout" />
        </FreshOnNavigate>
      </nav>
      {children}
    </div>
  );
}
