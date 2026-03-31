/**
 * @file CFCommandCenterNav.tsx
 * @description Shared navigation bar for all Cloudflare Command Center toolbox pages.
 *
 * Renders a horizontal pill/tab strip at the top of every CF toolbox page.
 * Tabs that belong to the production page (Resources, Browser, Agent Config) navigate
 * to /tools/cloudflare-docs?tab=<name> when clicked from the beta page.
 * The active tab is highlighted with an orange underline.
 *
 * Agent Governance: When adding a new CF toolbox tab, add it to NAV_ITEMS.
 */

import { useNavigate, useLocation } from "react-router-dom";
import {
    Activity, Globe, Settings, Bot, FlaskConical,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ─── Nav Item Config ──────────────────────────────────────────────────────────

export type CFNavTab =
    | "chat"          // Docs Agent (production)
    | "chat-beta"     // Docs Agent [Beta]
    | "resources"     // CF Resource Browser
    | "browser"       // Browser Rendering
    | "settings";     // Agent Config / System Prompt

interface NavItem {
    tab: CFNavTab;
    label: string;
    icon: React.ElementType;
    /** Route to navigate to when clicked */
    href: (currentPath: string) => string;
}

const NAV_ITEMS: NavItem[] = [
    {
        tab: "chat",
        label: "Docs Agent",
        icon: Bot,
        href: () => "/tools/cloudflare-docs",
    },
    {
        tab: "chat-beta",
        label: "Docs Agent [Beta]",
        icon: FlaskConical,
        href: () => "/tools/cloudflare-docs-beta",
    },
    {
        tab: "resources",
        label: "Resources",
        icon: Globe,
        href: () => "/tools/cloudflare-docs?tab=resources",
    },
    {
        tab: "browser",
        label: "Browser",
        icon: Globe,
        href: () => "/tools/cloudflare-docs?tab=browser",
    },
    {
        tab: "settings",
        label: "Agent Config",
        icon: Settings,
        href: () => "/tools/cloudflare-docs?tab=settings",
    },
];

// ─── Component ────────────────────────────────────────────────────────────────

interface CFCommandCenterNavProps {
    /** Which tab is currently active on this page */
    activeTab: CFNavTab;
    /** Optional shadcn <Tabs> onValueChange hook (used on production page for local tabs) */
    onTabChange?: (tab: string) => void;
    /** If true, Resources/Browser/Settings switch internal tabs instead of navigating */
    useInternalTabs?: boolean;
}

export function CFCommandCenterNav({
    activeTab,
    onTabChange,
    useInternalTabs = false,
}: CFCommandCenterNavProps) {
    const navigate = useNavigate();
    const location = useLocation();

    const handleClick = (item: NavItem) => {
        // For the production page (useInternalTabs=true), local tabs switch via onTabChange
        if (useInternalTabs && onTabChange && ["resources", "browser", "settings", "chat"].includes(item.tab)) {
            onTabChange(item.tab === "chat" ? "chat" : item.tab);
            return;
        }
        navigate(item.href(location.pathname));
    };

    return (
        <div className="flex items-center gap-0 bg-transparent p-0 h-auto border-none rounded-none">
            {NAV_ITEMS.map(({ tab, label, icon: Icon }) => {
                const isActive = tab === activeTab;
                return (
                    <button
                        key={tab}
                        onClick={() => handleClick(NAV_ITEMS.find(i => i.tab === tab)!)}
                        className={cn(
                            "flex items-center gap-1.5 px-4 pb-2 pt-0 text-xs rounded-none border-b-2 transition-colors whitespace-nowrap",
                            isActive
                                ? "border-orange-500 text-foreground font-medium"
                                : "border-transparent text-muted-foreground hover:text-foreground/80"
                        )}
                    >
                        <Icon className="w-3.5 h-3.5" />
                        {label}
                        {tab === "chat-beta" && (
                            <span className="ml-0.5 text-[9px] px-1 py-0 rounded bg-orange-500/20 text-orange-300 font-semibold border border-orange-500/25">
                                β
                            </span>
                        )}
                    </button>
                );
            })}
        </div>
    );
}
