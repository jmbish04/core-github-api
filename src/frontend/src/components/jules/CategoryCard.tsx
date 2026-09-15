import { Card, CardContent, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Layout, Server, Settings, PenTool, Folder, MoreVertical } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";

interface Category {
  id: string;
  name: string;
  description: string;
  icon: string;
  color: string;
  taskCount: number;
  lastActive: string;
}

interface CategoryCardProps {
  category: Category;
  onEdit: () => void;
}

const IconMap: Record<string, React.ElementType> = {
  Layout,
  Server,
  Settings,
  PenTool,
  Folder,
};

export function CategoryCard({ category, onEdit }: CategoryCardProps) {
  const navigate = useNavigate();
  const IconComponent = IconMap[category.icon] || Folder;

  const handleCardClick = (e: React.MouseEvent) => {
    // Navigate to tasks with this category filter
    navigate(`/jules/tasks?category=${category.id}`);
  };

  const handleEditClick = (e: React.MouseEvent) => {
    e.stopPropagation(); // Prevent navigation when clicking edit
    onEdit();
  };

  return (
    <Card 
      onClick={handleCardClick}
      className="bg-zinc-900 border-zinc-800 hover:bg-zinc-800/80 transition-colors cursor-pointer group flex flex-col justify-between"
    >
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <div className="flex items-center space-x-3">
          <div 
            className="p-2 rounded-md bg-zinc-800"
            style={{ color: category.color }}
          >
            <IconComponent className="h-5 w-5" />
          </div>
          <CardTitle className="text-sm font-medium text-zinc-100">
            {category.name}
          </CardTitle>
        </div>
        <Button 
          variant="ghost" 
          size="icon" 
          className="h-8 w-8 text-zinc-400 opacity-0 group-hover:opacity-100 transition-opacity hover:text-zinc-100 hover:bg-zinc-700"
          onClick={handleEditClick}
        >
          <MoreVertical className="h-4 w-4" />
        </Button>
      </CardHeader>
      <CardContent>
        <p className="text-xs text-zinc-400 mt-2 line-clamp-2">
          {category.description}
        </p>
      </CardContent>
      <CardFooter className="flex justify-between items-center text-xs text-zinc-500 pt-0">
        <Badge variant="secondary" className="bg-zinc-800 text-zinc-300 hover:bg-zinc-700">
          {category.taskCount} task{category.taskCount !== 1 ? 's' : ''}
        </Badge>
        <span>Active {category.lastActive}</span>
      </CardFooter>
    </Card>
  );
}
