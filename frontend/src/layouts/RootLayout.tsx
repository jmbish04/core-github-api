
import { NavLink, Outlet } from "react-router-dom";
import { AppSidebar } from "@/components/layout/AppSidebar";
import { HealthWidget } from "@/components/health/HealthWidget";

export default function RootLayout() {
    const topNavLinks = [
        { label: "Home", href: "/" },
        { label: "Dashboard", href: "/control-center/dashboard" },
        { label: "Projects", href: "/projects" },
        { label: "Research", href: "/research" },
        { label: "Health", href: "/health" },
        { label: "Workflows", href: "/workflows" },
        { label: "Webhooks", href: "/control-center/webhooks" },
        { label: "Docs", href: "/docs" },
        { label: "Spark Core", href: "/spark" },
        { label: "Settings", href: "/control-center/settings" },
        { label: "Control Center", href: "/control-center/dashboard" },
    ];

    return (
        <div className="flex h-screen bg-background text-foreground font-sans antialiased overflow-hidden">
            <AppSidebar className="shrink-0" />
            <main className="flex-1 flex flex-col h-full overflow-hidden relative">
                <header className="h-14 border-b px-6 flex items-center justify-between bg-card/50 backdrop-blur-md sticky top-0 z-10 gap-4">
                    <div className="flex items-center gap-4 min-w-0">
                        <div className="flex items-center gap-2 text-muted-foreground shrink-0">
                            <svg
                                aria-hidden="true"
                                viewBox="0 0 24 24"
                                className="h-5 w-5"
                                fill="currentColor"
                            >
                                <path d="M12 .297a12 12 0 0 0-3.79 23.4c.6.11.82-.26.82-.58v-2.04c-3.34.73-4.04-1.42-4.04-1.42-.55-1.38-1.33-1.75-1.33-1.75-1.08-.75.08-.74.08-.74 1.2.08 1.83 1.22 1.83 1.22 1.07 1.82 2.81 1.3 3.49 1 .11-.77.42-1.3.76-1.6-2.67-.3-5.47-1.33-5.47-5.93 0-1.31.47-2.38 1.24-3.22-.12-.3-.54-1.52.12-3.18 0 0 1.01-.32 3.3 1.23a11.5 11.5 0 0 1 6.01 0c2.28-1.55 3.29-1.23 3.29-1.23.66 1.66.24 2.88.12 3.18.77.84 1.24 1.91 1.24 3.22 0 4.61-2.8 5.63-5.48 5.92.43.37.81 1.1.81 2.22v3.29c0 .32.22.7.82.58A12 12 0 0 0 12 .297" />
                            </svg>
                            <h1 className="text-sm font-medium">Core GitHub API</h1>
                        </div>
                        <nav className="hidden lg:flex items-center gap-1 overflow-x-auto">
                            {topNavLinks.map((link) => (
                                <NavLink
                                    key={link.href}
                                    to={link.href}
                                    className={({ isActive }) =>
                                        [
                                            "rounded-md px-2.5 py-1.5 text-xs font-medium whitespace-nowrap transition-colors",
                                            isActive
                                                ? "bg-secondary text-secondary-foreground"
                                                : "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
                                        ].join(" ")
                                    }
                                >
                                    {link.label}
                                </NavLink>
                            ))}
                        </nav>
                    </div>
                    <HealthWidget />
                </header>
                <div className="flex-1 overflow-y-auto overflow-x-hidden p-6 relative">
                    <Outlet />
                </div>
            </main>
        </div>
    );
}
