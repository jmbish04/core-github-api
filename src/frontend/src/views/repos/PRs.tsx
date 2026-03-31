import { useOutletContext } from "react-router-dom";
import { PRCommandCenterTab } from "@/components/project-dashboard/tabs/PRCommandCenterTab";
import { PRCommandCenter } from "@/components/PRCommandCenter";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function ProjectPrsPage() {
  const { overview } = useOutletContext<any>();
  return (
    <PRCommandCenterTab>
      <Card>
        <CardHeader>
          <CardTitle>PR Command Center</CardTitle>
          <CardDescription>
            Review open PRs, run agentic code review, and automate fixes.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <PRCommandCenter
            repoOwner={overview.repository.owner}
            repoName={overview.repository.name}
            initialPrs={overview.pendingPrs}
          />
        </CardContent>
      </Card>
    </PRCommandCenterTab>
  );
}
