import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { workflowCatalog } from "@/components/workflows/catalog";

export default function WorkflowsLandingPage() {
  return (
    <div className="mx-auto flex h-[calc(100vh-8rem)] max-w-7xl flex-col gap-6">
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-2">
          <h1 className="text-3xl font-bold tracking-tight">Workflow Studio</h1>
          <p className="max-w-3xl text-muted-foreground">
            Browse active automations, open a workflow diagram for iterative edits, or create a
            new workflow draft with the assistant sidebar.
          </p>
        </div>
        <Button asChild>
          <Link to="/workflows/new">Create New Workflow</Link>
        </Button>
      </div>

      <Card className="flex-1 overflow-hidden">
        <CardHeader>
          <CardTitle>Available Workflows</CardTitle>
        </CardHeader>
        <CardContent className="h-full overflow-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Workflow Name</TableHead>
                <TableHead>Event Trigger(s)</TableHead>
                <TableHead>Automation Description</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {workflowCatalog.map((workflow) => (
                <TableRow key={workflow.key} className="cursor-pointer">
                  <TableCell className="font-medium">
                    <Link
                      to={`/workflows/${workflow.key}`}
                      className="text-primary underline-offset-4 hover:underline"
                    >
                      {workflow.title}
                    </Link>
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1.5">
                      {workflow.triggers.map((trigger) => (
                        <Badge key={`${workflow.key}-${trigger}`} variant="secondary">
                          {trigger}
                        </Badge>
                      ))}
                    </div>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {workflow.automationDescription}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

