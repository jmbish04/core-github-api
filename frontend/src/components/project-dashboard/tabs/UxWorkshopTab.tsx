import type { ReactNode } from "react";

type UxWorkshopTabProps = {
  children: ReactNode;
};

export function UxWorkshopTab({ children }: UxWorkshopTabProps) {
  return <div className="space-y-4">{children}</div>;
}

