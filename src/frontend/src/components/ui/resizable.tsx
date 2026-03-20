import * as React from "react";
import { GripVertical } from "lucide-react";
import {
  Group as PanelGroup,
  Panel as PanelPrimitive,
  Separator as PanelResizeHandle,
} from "react-resizable-panels";
import { cn } from "@/lib/utils";

function ResizablePanelGroup({
  className,
  ...props
}: React.ComponentProps<typeof PanelGroup>) {
  return (
    <PanelGroup
      className={cn(
        "flex h-full w-full data-[group-orientation=vertical]:flex-col",
        className,
      )}
      {...props}
    />
  );
}

const ResizablePanel = PanelPrimitive;

function ResizableHandle({
  withHandle,
  className,
  ...props
}: React.ComponentProps<typeof PanelResizeHandle> & {
  withHandle?: boolean;
}) {
  return (
    <PanelResizeHandle
      className={cn(
        "relative flex w-px items-center justify-center bg-border after:absolute after:inset-y-0 after:left-1/2 after:w-1 after:-translate-x-1/2 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring focus-visible:ring-offset-1 data-[group-orientation=vertical]:h-px data-[group-orientation=vertical]:w-full data-[group-orientation=vertical]:after:left-0 data-[group-orientation=vertical]:after:h-1 data-[group-orientation=vertical]:after:w-full data-[group-orientation=vertical]:after:-translate-y-1/2",
        className,
      )}
      {...props}
    >
      {withHandle ? (
        <div className="z-10 flex h-8 w-4 items-center justify-center rounded-sm border bg-background">
          <GripVertical className="h-3.5 w-3.5" />
        </div>
      ) : null}
    </PanelResizeHandle>
  );
}

export { ResizableHandle, ResizablePanel, ResizablePanelGroup };
