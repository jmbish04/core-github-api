import { useQuery } from '@tanstack/react-query';

export interface Category {
  id: string;
  name: string;
  description: string;
  taskCount: number;
  color: string;
  icon: string;
}

interface CategoriesResponse {
  success: boolean;
  categories: Category[];
}

export function useJulesCategories() {
  const query = useQuery<CategoriesResponse>({
    queryKey: ['jules-categories'],
    queryFn: async () => {
      const res = await fetch('/api/jules/categories');
      if (!res.ok) throw new Error(`Failed to fetch categories: ${res.statusText}`);
      return res.json();
    },
  });

  return {
    categories: query.data?.categories || [],
    isLoading: query.isLoading,
    error: query.error,
    refetch: query.refetch,
  };
}
