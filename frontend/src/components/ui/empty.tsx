import * as React from "react"
import { cn } from "@/lib/utils"

const Empty = React.forwardRef<
    HTMLDivElement,
    React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
    <div
        ref={ref}
        className={cn(
            "flex h-full w-full flex-col items-center justify-center rounded-lg border-2 border-dashed p-8 text-center animate-in fade-in-50",
            className
        )}
        {...props}
    />
))
Empty.displayName = "Empty"

const EmptyHeader = React.forwardRef<
    HTMLDivElement,
    React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
    <div
        ref={ref}
        className={cn("flex flex-col items-center gap-2", className)}
        {...props}
    />
))
EmptyHeader.displayName = "EmptyHeader"

const EmptyMedia = React.forwardRef<
    HTMLDivElement,
    React.HTMLAttributes<HTMLDivElement> & { variant?: "icon" | "image" }
>(({ className, variant = "icon", children, ...props }, ref) => (
    <div
        ref={ref}
        className={cn(
            "flex items-center justify-center rounded-full bg-muted",
            variant === "icon" && "h-12 w-12",
            variant === "image" && "h-24 w-24",
            className
        )}
        {...props}
    >
        {variant === "icon" && React.isValidElement(children)
            ? React.cloneElement(children as React.ReactElement<any>, {
                className: "h-6 w-6 text-muted-foreground",
            })
            : children}
    </div>
))
EmptyMedia.displayName = "EmptyMedia"

const EmptyTitle = React.forwardRef<
    HTMLHeadingElement,
    React.HTMLAttributes<HTMLHeadingElement>
>(({ className, ...props }, ref) => (
    <h3
        ref={ref}
        className={cn("text-lg font-semibold tracking-tight", className)}
        {...props}
    />
))
EmptyTitle.displayName = "EmptyTitle"

const EmptyDescription = React.forwardRef<
    HTMLParagraphElement,
    React.HTMLAttributes<HTMLParagraphElement>
>(({ className, ...props }, ref) => (
    <p
        ref={ref}
        className={cn("text-sm text-muted-foreground max-w-sm", className)}
        {...props}
    />
))
EmptyDescription.displayName = "EmptyDescription"

export { Empty, EmptyHeader, EmptyMedia, EmptyTitle, EmptyDescription }
