import { useOutletContext } from "react-router-dom";
import { StatsTab } from "../control/global/tabs/StatsTab";

export default function ProjectStatsPage() {
  const { repoOwner, repoName, basePath, overview, setSelectedEvent } = useOutletContext<any>();
  return (
    <StatsTab
      repoOwner={repoOwner}
      repoName={repoName}
      basePath={basePath}
      overview={overview}
      onSelectEvent={setSelectedEvent}
    />
  );
}
