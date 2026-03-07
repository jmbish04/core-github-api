import React from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { format } from "date-fns"; // Assuming date-fns is available (package.json has it)

export interface AuditLogEntry {
  id: number;
  timestamp: string;
  actor_id: string; // Worker or User
  action: string;
  config_key: string;
  old_value: string | null;
  new_value: string | null;
  metadata?: string | null;
}

interface AuditTableProps {
  logs: AuditLogEntry[];
}

export function AuditTable({ logs }: AuditTableProps) {
  return (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-[180px]">Timestamp</TableHead>
            <TableHead>Actor</TableHead>
            <TableHead>Action</TableHead>
            <TableHead>Key</TableHead>
            <TableHead>Old Value</TableHead>
            <TableHead>New Value</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {logs.length === 0 ? (
            <TableRow>
              <TableCell colSpan={6} className="h-24 text-center">
                No audit logs found.
              </TableCell>
            </TableRow>
          ) : (
            logs.map((log) => (
              <TableRow key={log.id}>
                <TableCell className="font-mono text-xs">
                  {format(new Date(log.timestamp), "yyyy-MM-dd HH:mm:ss")}
                </TableCell>
                <TableCell>{log.actor_id}</TableCell>
                <TableCell>
                    <span className="inline-flex items-center rounded-md border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 border-transparent bg-primary text-primary-foreground hover:bg-primary/80">
                        {log.action}
                    </span>
                </TableCell>
                <TableCell className="font-mono text-sm">{log.config_key}</TableCell>
                <TableCell className="font-mono text-xs text-muted-foreground truncate max-w-[150px]">
                  {log.old_value || "-"}
                </TableCell>
                <TableCell className="font-mono text-xs truncate max-w-[150px]">
                  {log.new_value || "-"}
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  );
}
