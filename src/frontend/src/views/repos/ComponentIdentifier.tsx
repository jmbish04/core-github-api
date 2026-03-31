import { useOutletContext } from "react-router-dom";
import { ComponentIdentifierTab } from "@/components/project-dashboard/tabs/ComponentIdentifierTab";

export default function ProjectComponentIdentifierPage() {
  const { overview } = useOutletContext<any>();
  return (
    <ComponentIdentifierTab
      repoFullName={`${overview.repository.owner}/${overview.repository.name}`}
    />
  );
}
