import { useOutletContext } from "react-router-dom";
import { VibeCodingTab } from "@/components/project-dashboard/tabs/VibeCodingTab";

export default function ProjectVibeSdkPage() {
  const { overview } = useOutletContext<any>();
  return (
    <VibeCodingTab
      projectName={overview.project.name}
      repoOwner={overview.repository.owner}
      repoName={overview.repository.name}
    />
  );
}
