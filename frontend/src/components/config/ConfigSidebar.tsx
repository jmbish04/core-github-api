import React from "react";
import { cn } from "@/lib/utils";
import { buttonVariants } from "@/components/ui/button";
import { Settings, Bot, Github, Lock, Database } from "lucide-react";

interface SidebarProps {
  currentCategory?: string;
}

const items = [
  {
    title: "General",
    href: "/config/general",
    icon: Settings,
    category: "general"
  },
  {
    title: "AI Settings",
    href: "/config/ai",
    icon: Bot,
    category: "ai"
  },
  {
    title: "GitHub Integration",
    href: "/config/github",
    icon: Github,
    category: "github"
  },
  {
    title: "Secrets & Security",
    href: "/config/secrets",
    icon: Lock,
    category: "secrets"
  },
  {
    title: "Change History",
    href: "/config/history",
    icon: Database, // or History icon
    category: "history"
  },
];

export function ConfigSidebar({ currentCategory }: SidebarProps) {
  return (
    <nav className="flex flex-col space-y-1 w-64 p-4 border-r h-full">
      <h2 className="mb-2 px-4 text-lg font-semibold tracking-tight">
        Settings
      </h2>
      <div className="space-y-1">
        {items.map((item) => (
          <a
            key={item.href}
            href={item.href}
            className={cn(
              buttonVariants({ variant: "ghost" }),
              currentCategory === item.category
                ? "bg-muted hover:bg-muted"
                : "hover:bg-transparent hover:underline",
              "justify-start w-full"
            )}
          >
            <item.icon className="mr-2 h-4 w-4" />
            {item.title}
          </a>
        ))}
      </div>
    </nav>
  );
}
