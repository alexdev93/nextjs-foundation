// app/blog/template.tsx
export default function Template({ children }: { children: React.ReactNode }) {
  return <div className="animate-in fade-in">{children}</div>;
}
