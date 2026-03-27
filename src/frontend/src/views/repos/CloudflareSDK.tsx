import { useOutletContext } from "react-router-dom";
import { CloudflareSdkDashboard } from "@/components/cloudflaresdk/CloudflareSdkDashboard";

export default function ProjectCloudflareSdkPage() {
  const { overview } = useOutletContext<any>();
  return (
    <CloudflareSdkDashboard
      repoOwner={overview.repository.owner}
      repoName={overview.repository.name}
      overview={overview}
    />
  );
}
