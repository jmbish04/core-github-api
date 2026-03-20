
import * as React from "react"
import { ChevronDown } from "lucide-react"
import { cn } from "@/lib/utils"

const Accordion = React.forwardRef<
    HTMLDivElement,
    React.HTMLAttributes<HTMLDivElement> & { type?: "single" | "multiple", collapsible?: boolean }
>(({ className, ...props }, ref) => (
    <div ref={ref} className={cn("", className)} {...props} />
))
Accordion.displayName = "Accordion"

const AccordionItem = React.forwardRef<
    HTMLDivElement,
    React.HTMLAttributes<HTMLDivElement> & { value: string }
>(({ className, ...props }, ref) => (
    // Ideally this would use Context to handle open/close state, but for simple use case we'll rely on simple prop drilling or uncontrolled for now.
    // Actually, Shadcn relies on Radix.
    // We will build a simple stateful version here for now.
    <div ref={ref} className={cn("border-b", className)} {...props} />
))
AccordionItem.displayName = "AccordionItem"

// Context for simple state management
const AccordionContext = React.createContext<{
    openItems: string[];
    toggle: (value: string) => void;
}>({ openItems: [], toggle: () => { } });

// We need a wrapper to manage state if we want "single" or "multiple" behavior like Radix.
// But without Radix, mimicking it perfectly is hard in one file without heavy logic.
// Let's implement a simplified "Accordion" that expects `value` and `onValueChange` if controlled, or manages internal state.

export function SimpleAccordion({
    children,
    type = "single",
    className,
    defaultValue
}: { children: React.ReactNode, type?: "single" | "multiple", className?: string, defaultValue?: string | string[] }) {
    const [openItems, setOpenItems] = React.useState<string[]>(
        Array.isArray(defaultValue) ? defaultValue : defaultValue ? [defaultValue] : []
    );

    const toggle = (value: string) => {
        setOpenItems(prev => {
            if (prev.includes(value)) {
                return prev.filter(v => v !== value);
            } else {
                return type === "single" ? [value] : [...prev, value];
            }
        });
    };

    return (
        <AccordionContext.Provider value={{ openItems, toggle }}>
            <div className={className}>{children}</div>
        </AccordionContext.Provider>
    );
}

const SimpleAccordionItem = ({ value, children, className }: { value: string, children: React.ReactNode, className?: string }) => {
    // Inject value into children context? No, just pass it down?
    // We can use cloneElement or Context.
    // Let's rely on Context.
    return (
        <div className={cn("border-b", className)} data-value={value}>
            {React.Children.map(children, child => {
                if (React.isValidElement(child)) {
                    // @ts-ignore
                    return React.cloneElement(child, { value });
                }
                return child;
            })}
        </div>
    )
}

const SimpleAccordionTrigger = ({ children, className, value }: { children: React.ReactNode, className?: string, value?: string }) => {
    const { openItems, toggle } = React.useContext(AccordionContext);
    const isOpen = value ? openItems.includes(value) : false;

    return (
        <button
            onClick={() => value && toggle(value)}
            className={cn(
                "flex flex-1 items-center justify-between py-4 font-medium transition-all hover:underline [&[data-state=open]>svg]:rotate-180",
                className
            )}
            data-state={isOpen ? "open" : "closed"}
        >
            {children}
            <ChevronDown className="h-4 w-4 shrink-0 transition-transform duration-200" />
        </button>
    )
}

const SimpleAccordionContent = ({ children, className, value }: { children: React.ReactNode, className?: string, value?: string }) => {
    const { openItems } = React.useContext(AccordionContext);
    const isOpen = value ? openItems.includes(value) : false;

    if (!isOpen) return null;

    return (
        <div className={cn("pb-4 pt-0", className)}>
            {children}
        </div>
    )
}

export { SimpleAccordion as Accordion, SimpleAccordionItem as AccordionItem, SimpleAccordionTrigger as AccordionTrigger, SimpleAccordionContent as AccordionContent }
