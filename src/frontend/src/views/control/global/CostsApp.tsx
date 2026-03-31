import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { CloudflareCosts } from "./CloudflareCosts";

const queryClient = new QueryClient();

export default function CostsApp() {
  return (
    <QueryClientProvider client={queryClient}>
      <CloudflareCosts />
    </QueryClientProvider>
  );
}
