import { useState } from "react";
import { Plus, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CategoryCard } from "@/components/jules/CategoryCard";
import { EditCategoryDialog } from "@/components/jules/EditCategoryDialog";
import { useJulesCategories } from "@/hooks/jules/useJulesCategories";
import type { Category as ApiCategory } from "@/hooks/jules/useJulesCategories";

interface CategoryDisplay {
  id: string;
  name: string;
  description: string;
  icon: string;
  color: string;
  taskCount: number;
  lastActive: string;
}

function toDisplay(cat: ApiCategory): CategoryDisplay {
  return {
    id: cat.id,
    name: cat.name,
    description: cat.description,
    icon: cat.icon,
    color: cat.color,
    taskCount: cat.taskCount,
    lastActive: cat.taskCount > 0 ? "Recently" : "No tasks",
  };
}

export function CategoriesPage() {
  const { categories: apiCategories, isLoading, error } = useJulesCategories();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<CategoryDisplay | null>(null);

  const categories = apiCategories.map(toDisplay);

  const handleEdit = (category: CategoryDisplay) => {
    setSelectedCategory(category);
    setIsDialogOpen(true);
  };

  const handleCreateNew = () => {
    setSelectedCategory(null);
    setIsDialogOpen(true);
  };

  const handleSave = (_val: Omit<CategoryDisplay, "id" | "taskCount" | "lastActive">) => {
    // Categories are derived from task classification — editing is presentational only
    void _val;
  };

  return (
    <div className="p-6 h-full flex flex-col gap-6 text-zinc-100">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Categories</h1>
          <p className="text-sm text-zinc-400 mt-1">
            Task categories derived from your backlog, grouped by keyword analysis.
          </p>
        </div>
        <Button onClick={handleCreateNew} className="bg-zinc-100 text-zinc-900 hover:bg-zinc-200">
          <Plus className="mr-2 h-4 w-4" />
          New Category
        </Button>
      </div>

      {isLoading && (
        <div className="flex items-center justify-center py-12 text-zinc-500 gap-2">
          <Loader2 className="w-5 h-5 animate-spin" />
          Loading categories...
        </div>
      )}
      {error ? (
        <div className="text-sm text-red-400 bg-red-950/30 border border-red-900 rounded-md p-3">
          Failed to load categories: {error instanceof Error ? error.message : String(error)}
        </div>
      ) : null}

      {!isLoading && !error && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {categories.map((category) => (
            <CategoryCard
              key={category.id}
              category={category}
              onEdit={() => handleEdit(category)}
            />
          ))}
        </div>
      )}

      <EditCategoryDialog
        isOpen={isDialogOpen}
        onOpenChange={setIsDialogOpen}
        category={selectedCategory}
        onSave={handleSave}
      />
    </div>
  );
}
