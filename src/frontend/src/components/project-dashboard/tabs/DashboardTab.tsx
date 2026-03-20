import type { ReactNode } from "react";

type DashboardTabProps = {
  children: ReactNode;
};

export function DashboardTab({ children }: DashboardTabProps) {
  return <div className="space-y-4">{children}</div>;
}

