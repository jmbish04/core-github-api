import { useOutletContext } from "react-router-dom";
import { UxWorkshopTab } from "@/components/project-dashboard/tabs/UxWorkshopTab";

export default function ProjectUxWorkshopPage() {
  const { projectId, overview } = useOutletContext<any>();
  return (
    <UxWorkshopTab
      projectId={projectId}
      projectName={overview.project.name}
      repoOwner={overview.repository.owner}
      repoName={overview.repository.name}
    />
  );
}
