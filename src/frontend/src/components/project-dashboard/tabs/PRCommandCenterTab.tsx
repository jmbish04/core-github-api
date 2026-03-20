import type { ReactNode } from "react";

type PRCommandCenterTabProps = {
  children: ReactNode;
};

export function PRCommandCenterTab({ children }: PRCommandCenterTabProps) {
  return <div className="space-y-4">{children}</div>;
}

