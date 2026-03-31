/**
 * @file ProjectCardGrid.tsx
 * Shared project card grid used by both Global (all repos) and Repo-scoped views.
 * Purely presentational — data fetching and navigation callbacks are injected by the parent.
 */

import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ArrowRight,
  FolderGit2,
  GitBranch,
  Star,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { getProjectHealth, type Project } from "./project-utils";

// ── Loading Skeletons ────────────────────────────────────────────────────────

export function ProjectCardSkeletons({ count = 6 }: { count?: number }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
      {Array.from({ length: count }).map((_, i) => (
        <Card key={i} className="flex flex-col h-full border-muted">
          <CardHeader className="gap-2">
            <div className="flex items-start justify-between">
              <Skeleton className="h-6 w-3/4" />
              <div className="flex gap-2">
                <Skeleton className="h-5 w-16" />
                <Skeleton className="h-5 w-16 rounded-full" />
              </div>
            </div>
            <Skeleton className="h-4 w-full mt-2" />
            <Skeleton className="h-4 w-5/6" />
          </CardHeader>
          <CardContent className="flex-1">
            <div className="flex gap-2 mt-4">
              <Skeleton className="h-3 w-12" />
              <Skeleton className="h-3 w-24" />
            </div>
          </CardContent>
          <CardFooter className="bg-muted/10 border-t pt-4">
            <Skeleton className="h-9 w-full" />
          </CardFooter>
        </Card>
      ))}
    </div>
  );
}

// ── Main Grid ────────────────────────────────────────────────────────────────

export interface ProjectCardGridProps {
  /** The list of projects to render. */
  projects: Project[];
  /** Callback fired when the user clicks a project card or "View Dashboard". */
  onOpenProject: (project: Project) => void;
  /** Callback fired when the user clicks the star/favourite toggle. */
  onToggleFavorite?: (project: Project) => void;
  /** Predicate: is this project currently favourited? */
  isFavorite?: (fullName: string) => boolean;
  /** Content to show when the list is empty. */
  emptyAction?: () => void;
}

export function ProjectCardGrid({
  projects,
  onOpenProject,
  onToggleFavorite,
  isFavorite,
  emptyAction,
}: ProjectCardGridProps) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
      {projects.map((project) => {
        const health = getProjectHealth(project);
        return (
          <Card
            key={project.id}
            className="group hover:border-primary/50 transition-colors flex flex-col cursor-pointer"
            onClick={() => onOpenProject(project)}
          >
            <CardHeader>
              <div className="flex items-start justify-between">
                <CardTitle className="text-xl flex items-center gap-2">
                  <FolderGit2 className="w-5 h-5 text-blue-500" />
                  {project.name}
                </CardTitle>
                <div className="flex items-center gap-2">
                  <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                    <span
                      className={`h-2 w-2 rounded-full ${health.dotClassName}`}
                    />
                    {health.label}
                  </span>
                  <Badge
                    variant={
                      project.status === "active" ? "default" : "secondary"
                    }
                  >
                    {project.status}
                  </Badge>
                  {onToggleFavorite &&
                    isFavorite &&
                    project.repoOwner &&
                    project.repoName && (
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7"
                        onClick={(event) => {
                          event.stopPropagation();
                          onToggleFavorite(project);
                        }}
                      >
                        <Star
                          className={cn(
                            "h-4 w-4",
                            isFavorite(
                              `${project.repoOwner!.toLowerCase()}/${project.repoName!.toLowerCase()}`
                            )
                              ? "fill-current text-amber-400"
                              : "text-muted-foreground"
                          )}
                        />
                      </Button>
                    )}
                </div>
              </div>
              <CardDescription className="line-clamp-2 min-h-[2.5em]">
                {project.description || "No description provided."}
              </CardDescription>
            </CardHeader>
            <CardContent className="flex-1">
              <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                <span className="flex items-center gap-1">
                  <GitBranch className="w-3 h-3" /> main
                </span>
                <span>•</span>
                <span>
                  Last deployed{" "}
                  {new Date(
                    project.lastDeployedAt ||
                      project.updatedAt ||
                      project.createdAt
                  ).toLocaleDateString()}
                </span>
              </div>
            </CardContent>
            <CardFooter className="bg-muted/10 border-t pt-4 flex gap-2">
              <Button
                variant="ghost"
                className="flex-1 justify-between hover:bg-background group-hover:text-primary"
                onClick={(event) => {
                  event.stopPropagation();
                  onOpenProject(project);
                }}
              >
                View Dashboard <ArrowRight className="w-4 h-4" />
              </Button>
            </CardFooter>
          </Card>
        );
      })}

      {/* Empty State */}
      {projects.length === 0 && (
        <div className="col-span-full py-12 text-center text-muted-foreground border-2 border-dashed rounded-lg">
          <FolderGit2 className="w-12 h-12 mx-auto mb-4 opacity-50" />
          <h3 className="text-lg font-medium">No projects found</h3>
          <p>Try adjusting your filters or create a new one.</p>
          {emptyAction && (
            <Button variant="link" onClick={emptyAction} className="mt-2">
              Create Project
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
