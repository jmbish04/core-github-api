import React from "react";
import { TaskForm } from "@/components/jules/TaskForm";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const NewTaskPage = () => {
  return (
    <div className="container mx-auto py-10 max-w-3xl">
      <Card className="w-full">
        <CardHeader>
          <CardTitle className="text-2xl font-bold">New Task</CardTitle>
          <CardDescription>
            Create a new task for Jules to execute on your repository.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <TaskForm />
        </CardContent>
      </Card>
    </div>
  );
};
