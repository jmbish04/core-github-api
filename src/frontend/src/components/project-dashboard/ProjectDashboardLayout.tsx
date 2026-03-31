import type { ReactNode } from "react";

type ProjectDashboardLayoutProps = {
  children: ReactNode;
};

export function ProjectDashboardLayout({ children }: ProjectDashboardLayoutProps) {
  return <div className="space-y-6 p-4 md:p-6 lg:p-8 pb-24">{children}</div>;
}

