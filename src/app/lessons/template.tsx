import type { ReactNode } from "react";

import { LifecycleLogger } from "./_components/lifecycle-logger";
import { PageView } from "./_components/page-view";

export default function LessonsTemplate({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-col gap-4">
      {/* <PageView /> */}
      <LifecycleLogger label="template" />
      {children}
    </div>
  );
}
