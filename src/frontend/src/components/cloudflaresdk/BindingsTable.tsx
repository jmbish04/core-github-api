import React, { useState } from "react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { AddBindingDialog } from "./AddBindingDialog";

interface BindingsTableProps {
  repoOwner: string;
  repoName: string;
  bindings?: Record<string, string[] | null>;
}

export function BindingsTable({ repoOwner, repoName, bindings }: BindingsTableProps) {
  const [search, setSearch] = useState("");

  const allBindings = React.useMemo(() => {
    if (!bindings) return [];
    
    // Flatten bindings dict into an array of { group, name }
    const flattened: Array<{ group: string; name: string }> = [];
    Object.entries(bindings).forEach(([group, items]) => {
      const validItems = (items || []).filter(Boolean);
      validItems.forEach((name) => {
        flattened.push({ group, name });
      });
    });
    return flattened;
  }, [bindings]);

  const filteredBindings = allBindings.filter(
    (b) => 
      b.name.toLowerCase().includes(search.toLowerCase()) || 
      b.group.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="relative w-64">
          <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input 
            placeholder="Filter bindings..." 
            className="pl-8 bg-muted/50 border-none"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <AddBindingDialog repoOwner={repoOwner} repoName={repoName} />
      </div>

      <div className="rounded-md border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[150px]">Resource Type</TableHead>
              <TableHead>Binding Name</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredBindings.length === 0 ? (
              <TableRow>
                <TableCell colSpan={2} className="h-24 text-center text-muted-foreground">
                  No bindings found.
                </TableCell>
              </TableRow>
            ) : (
              filteredBindings.map((binding) => (
                <TableRow key={`${binding.group}-${binding.name}`}>
                  <TableCell>
                    <Badge variant="secondary" className="uppercase text-[10px] tracking-wider font-semibold">
                      {binding.group.replace(/_/g, " ")}
                    </Badge>
                  </TableCell>
                  <TableCell className="font-mono text-sm">
                    {binding.name}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
