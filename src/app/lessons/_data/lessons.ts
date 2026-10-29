export const LESSONS = [
  { slug: "routing", title: "File-system routing", body: "Folders become URL segments." },
  { slug: "layouts", title: "Layouts", body: "Shared shells that stay mounted between pages." },
  { slug: "templates", title: "Templates", body: "Shells that remount on every navigation." },
] as const

export type Lesson = (typeof LESSONS)[number]

export function getLesson(slug: string): Lesson | undefined {
  return LESSONS.find((lesson) => lesson.slug === slug)
}
