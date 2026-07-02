import { cn } from "@/lib/utils";
import * as ResizablePrimitive from "react-resizable-panels";

import type * as React from "react";

const ResizablePanelGroup = ({
    className,
    direction,
    ...props
}: Omit<React.ComponentProps<typeof ResizablePrimitive.Group>, "orientation"> & {
    direction?: React.ComponentProps<typeof ResizablePrimitive.Group>["orientation"];
}) => (
    <ResizablePrimitive.Group
        className={cn(
            "flex h-full w-full data-[panel-group-direction=vertical]:flex-col",
            className,
        )}
        orientation={direction}
        {...props}
    />
);

const ResizablePanel = ResizablePrimitive.Panel;

const ResizableHandle = ({
    withHandle,
    className,
    ...props
}: React.ComponentProps<typeof ResizablePrimitive.Separator> & {
    withHandle?: boolean;
}) => (
    <ResizablePrimitive.Separator
        className={cn(
            "group focus-visible:ring-ring relative z-20 flex items-center justify-center bg-transparent focus-visible:ring-1 focus-visible:ring-offset-1 focus-visible:outline-none",
            "after:absolute after:inset-y-0 after:left-1/2 after:w-3 after:-translate-x-1/2",
            "data-[panel-group-direction=vertical]:h-2 data-[panel-group-direction=vertical]:w-full data-[panel-group-direction=vertical]:after:inset-x-0 data-[panel-group-direction=vertical]:after:top-1/2 data-[panel-group-direction=vertical]:after:h-3 data-[panel-group-direction=vertical]:after:w-full data-[panel-group-direction=vertical]:after:-translate-y-1/2 data-[panel-group-direction=vertical]:after:translate-x-0",
            withHandle
                ? "w-2 data-[panel-group-direction=vertical]:h-2"
                : "pointer-events-none w-0 data-[panel-group-direction=vertical]:h-0",
            className,
        )}
        {...props}
    >
        {withHandle ? (
            <div className="bg-sidebar-border group-hover:bg-ring/70 group-data-[separator=drag]:bg-ring z-10 h-8 w-0.5 rounded-full opacity-70 transition-[height,width,background-color,opacity] duration-150 group-hover:h-10 group-hover:w-1 group-hover:opacity-100 group-data-[separator=drag]:h-12 group-data-[separator=drag]:w-1 group-data-[separator=drag]:opacity-100 data-[panel-group-direction=vertical]:h-0.5 data-[panel-group-direction=vertical]:w-8 data-[panel-group-direction=vertical]:group-hover:h-1 data-[panel-group-direction=vertical]:group-hover:w-10" />
        ) : null}
    </ResizablePrimitive.Separator>
);

export { ResizableHandle, ResizablePanel, ResizablePanelGroup };
