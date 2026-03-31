import { useOutletContext } from "react-router-dom";
import { CloudflareDocsTool } from "@/components/tools/CloudflareDocsTool";

export default function ProjectToolsPage() {
  const { overview } = useOutletContext<any>();
  return (
    <CloudflareDocsTool
      defaultOwner={overview.repository.owner}
      defaultRepo={overview.repository.name}
    />
  );
}
