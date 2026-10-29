import { notFound } from "next/navigation"
import { Suspense } from "react"

import { PageHeader } from "@/shared/components/page-header"
import { getLesson, LESSONS } from "../_data/lessons"

export function generateStaticParams() {
  return LESSONS.map((lesson) => ({ slug: lesson.slug }))
}

// The App Shell is shared by every /lessons/[slug] link, so it can't depend on params.
// The params read lives inside Suspense; the fallback is what the shell paints instantly.
export default function LessonDetailPage({ params }: PageProps<"/lessons/[slug]">) {
  return (
    <Suspense fallback={<LessonHeaderSkeleton />}>
      <LessonHeader params={params} />
    </Suspense>
  )
}

async function LessonHeader({ params }: Pick<PageProps<"/lessons/[slug]">, "params">) {
  const { slug } = await params
  const lesson = getLesson(slug)
  if (!lesson) notFound()

  return <PageHeader title={lesson.title} description={lesson.body} />
}

function LessonHeaderSkeleton() {
  return (
    <header className="space-y-2 border-b pb-6">
      <div className="bg-muted h-8 w-64 animate-pulse rounded" />
      <div className="bg-muted h-5 w-96 max-w-full animate-pulse rounded" />
    </header>
  )
}
