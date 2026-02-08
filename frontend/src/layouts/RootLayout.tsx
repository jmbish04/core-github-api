
import { Outlet } from "react-router-dom";
import { Sidebar } from "@/components/navigation/Sidebar";
import { HealthWidget } from "@/components/health/HealthWidget";

export default function RootLayout() {
    return (
        <div className="flex min-h-screen bg-background text-foreground font-sans antialiased">
            <Sidebar />
            <main className="flex-1 flex flex-col min-h-0 overflow-hidden relative">
                <header className="h-14 border-b px-6 flex items-center justify-between bg-card/50 backdrop-blur-md sticky top-0 z-10">
                    <h1 className="text-sm font-medium text-muted-foreground">Core GitHub API ®</h1>
                    <HealthWidget />
                </header>
                <div className="flex-1 overflow-y-auto overflow-x-hidden p-6 relative">
                    <Outlet />
                </div>
            </main>
        </div>
    );
}
