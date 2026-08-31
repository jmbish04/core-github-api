import { useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CategoryCard } from "@/components/jules/CategoryCard";
import { EditCategoryDialog } from "@/components/jules/EditCategoryDialog";

interface Category {
  id: string;
  name: string;
  description: string;
  icon: string;
  color: string;
  taskCount: number;
  lastActive: string;
}

const mockCategories: Category[] = [
  {
    id: "frontend",
    name: "Frontend Development",
    description: "Tasks related to React, UI/UX, and client-side logic.",
    icon: "Layout",
    color: "#3b82f6",
    taskCount: 12,
    lastActive: "2 hours ago",
  },
  {
    id: "backend",
    name: "Backend Systems",
    description: "API design, database management, and server logic.",
    icon: "Server",
    color: "#10b981",
    taskCount: 8,
    lastActive: "5 hours ago",
  },
  {
    id: "devops",
    name: "DevOps & CI/CD",
    description: "Infrastructure, deployments, and automation pipelines.",
    icon: "Settings",
    color: "#f59e0b",
    taskCount: 3,
    lastActive: "1 day ago",
  },
  {
    id: "design",
    name: "Design & UX",
    description: "Wireframes, mockups, and user research.",
    icon: "PenTool",
    color: "#ec4899",
    taskCount: 5,
    lastActive: "3 days ago",
  },
];

export function CategoriesPage() {
  const [categories, setCategories] = useState<Category[]>(mockCategories);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<Category | null>(null);

  const handleEdit = (category: Category) => {
    setSelectedCategory(category);
    setIsDialogOpen(true);
  };

  const handleCreateNew = () => {
    setSelectedCategory(null);
    setIsDialogOpen(true);
  };

  const handleSave = (category: Omit<Category, "id" | "taskCount" | "lastActive">) => {
    if (selectedCategory) {
      setCategories((prev) =>
        prev.map((c) =>
          c.id === selectedCategory.id ? { ...c, ...category } : c
        )
      );
    } else {
      const newCategory: Category = {
        ...category,
        id: category.name.toLowerCase().replace(/\s+/g, "-"),
        taskCount: 0,
        lastActive: "Just now",
      };
      setCategories((prev) => [...prev, newCategory]);
    }
  };

  return (
    <div className="p-6 h-full flex flex-col gap-6 text-zinc-100">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Categories</h1>
          <p className="text-sm text-zinc-400 mt-1">
            Manage task categories and view their activity.
          </p>
        </div>
        <Button onClick={handleCreateNew} className="bg-zinc-100 text-zinc-900 hover:bg-zinc-200">
          <Plus className="mr-2 h-4 w-4" />
          New Category
        </Button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {categories.map((category) => (
          <CategoryCard
            key={category.id}
            category={category}
            onEdit={() => handleEdit(category)}
          />
        ))}
      </div>

      <EditCategoryDialog
        isOpen={isDialogOpen}
        onOpenChange={setIsDialogOpen}
        category={selectedCategory}
        onSave={handleSave}
      />
    </div>
  );
}
