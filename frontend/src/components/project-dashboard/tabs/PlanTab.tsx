import type { ReactNode } from "react";

type PlanTabProps = {
  children: ReactNode;
};

export function PlanTab({ children }: PlanTabProps) {
  return <div className="space-y-4">{children}</div>;
}

