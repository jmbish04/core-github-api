import { useOutletContext } from "react-router-dom";
import { PlanTab } from "@/components/project-dashboard/tabs/PlanTab";

export default function ProjectPlanPage() {
  const { projectId, overview, projectDetails, taskQueryData } = useOutletContext<any>();
  return (
    <PlanTab
      projectId={projectId}
      projectName={overview.project.name}
      phases={projectDetails?.phases || []}
      tasks={taskQueryData?.tasks || []}
    />
  );
}
