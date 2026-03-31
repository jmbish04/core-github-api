import { useOutletContext } from "react-router-dom";
import { ExplorerTab } from "../control/global/tabs/ExplorerTab";

export default function ProjectExplorerPage() {
  const { repoOwner, repoName, entries } = useOutletContext<any>();
  return <ExplorerTab repoOwner={repoOwner} repoName={repoName} entries={entries} />;
}
