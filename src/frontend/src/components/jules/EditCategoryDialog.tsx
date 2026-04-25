import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

interface Category {
  id: string;
  name: string;
  description: string;
  icon: string;
  color: string;
  taskCount: number;
  lastActive: string;
}

interface EditCategoryDialogProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  category: Category | null;
  onSave: (category: Omit<Category, "id" | "taskCount" | "lastActive">) => void;
}

const PRESET_COLORS = [
  "#3b82f6",
  "#10b981",
  "#f59e0b",
  "#ec4899",
  "#8b5cf6",
  "#ef4444",
  "#06b6d4",
  "#84cc16",
];

export function EditCategoryDialog({
  isOpen,
  onOpenChange,
  category,
  onSave,
}: EditCategoryDialogProps) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [icon, setIcon] = useState("Layout");
  const [color, setColor] = useState("#3b82f6");

  useEffect(() => {
    if (category) {
      setName(category.name);
      setDescription(category.description);
      setIcon(category.icon);
      setColor(category.color);
    } else {
      setName("");
      setDescription("");
      setIcon("Layout");
      setColor("#3b82f6");
    }
  }, [category, isOpen]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    onSave({ name: name.trim(), description: description.trim(), icon, color });
    onOpenChange(false);
  };

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px] bg-zinc-900 border-zinc-800 text-zinc-100">
        <DialogHeader>
          <DialogTitle>
            {category ? "Edit Category" : "New Category"}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="grid gap-4 py-4">
          <div className="grid gap-2">
            <Label htmlFor="name">Name</Label>
            <Input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Frontend Development"
              className="bg-zinc-800 border-zinc-700"
            />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="A brief description of this category..."
              className="bg-zinc-800 border-zinc-700 resize-none"
              rows={3}
            />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="icon">Icon Name</Label>
            <Input
              id="icon"
              value={icon}
              onChange={(e) => setIcon(e.target.value)}
              placeholder="e.g. Layout, Server, Settings"
              className="bg-zinc-800 border-zinc-700"
            />
          </div>

          <div className="grid gap-2">
            <Label>Color</Label>
            <div className="flex gap-2 flex-wrap">
              {PRESET_COLORS.map((preset) => (
                <button
                  key={preset}
                  type="button"
                  onClick={() => setColor(preset)}
                  className="w-8 h-8 rounded-full border-2 transition-all"
                  style={{
                    backgroundColor: preset,
                    borderColor: color === preset ? "white" : "transparent",
                    transform: color === preset ? "scale(1.15)" : "scale(1)",
                  }}
                />
              ))}
            </div>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              className="bg-zinc-100 text-zinc-900 hover:bg-zinc-200"
            >
              {category ? "Save Changes" : "Create Category"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
