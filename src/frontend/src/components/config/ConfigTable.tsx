import React, { useState } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Pencil, Check, X, Eye, EyeOff } from "lucide-react";

export type ConfigFieldType = "string" | "number" | "boolean" | "secret";

export interface ConfigFieldDef {
  key: string;
  label: string;
  type: ConfigFieldType;
  description?: string;
  options?: string[]; // For select inputs if needed
}

interface ConfigTableProps {
  data: Record<string, any>;
  fields: ConfigFieldDef[];
  onSave: (key: string, value: any) => Promise<void>;
}

export function ConfigTable({ data, fields, onSave }: ConfigTableProps) {
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [editValue, setEditValue] = useState<string>("");
  const [isSaving, setIsSaving] = useState(false);
  const [showSecret, setShowSecret] = useState<Record<string, boolean>>({});

  const handleEdit = (key: string, value: any) => {
    setEditingKey(key);
    setEditValue(String(value)); // Convert to string for input
  };

  const handleCancel = () => {
    setEditingKey(null);
    setEditValue("");
  };

  const handleSave = async (key: string, type: ConfigFieldType) => {
    setIsSaving(true);
    let payload: any = editValue;
    if (type === "number") payload = Number(editValue);
    if (type === "boolean") payload = editValue === "true";

    try {
      await onSave(key, payload);
      setEditingKey(null);
    } catch (error) {
      console.error("Failed to save config:", error);
      // Ideally show toast
    } finally {
      setIsSaving(false);
    }
  };

  const toggleSecret = (key: string) => {
    setShowSecret(prev => ({ ...prev, [key]: !prev[key] }));
  }

  return (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-[300px]">Setting</TableHead>
            <TableHead>Value</TableHead>
            <TableHead className="w-[100px] text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {fields.map((field) => {
            const isEditing = editingKey === field.key;
            const currentValue = data[field.key];
            const isSecret = field.type === "secret";
            const isRevealed = showSecret[field.key];
            
            // Masking logic handled by backend mostly, but if we have the value we can show/hide
            // Actually backend sends masked value 'sk-***'. 
            // If user edits, they overwrite.
            
            return (
              <TableRow key={field.key}>
                <TableCell className="font-medium">
                  <div>{field.label}</div>
                  <div className="text-xs text-muted-foreground">{field.description}</div>
                </TableCell>
                <TableCell>
                  {isEditing ? (
                    field.type === "boolean" ? (
                      <Select defaultValue={editValue} onValueChange={setEditValue}>
                        <SelectTrigger className="w-[180px]">
                          <SelectValue placeholder="Select..." />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="true">True</SelectItem>
                          <SelectItem value="false">False</SelectItem>
                        </SelectContent>
                      </Select>
                    ) : (
                      <Input
                        value={editValue}
                        onChange={(e) => setEditValue(e.target.value)}
                        type={field.type === "number" ? "number" : "text"}
                        className="max-w-[400px]"
                      />
                    )
                  ) : (
                    <div className="flex items-center gap-2">
                        <span className="font-mono text-sm max-w-[400px] truncate block">
                            {String(currentValue)}
                        </span>
                        {/* If it was a secret we could barely show/hide unless we fetched full val? 
                            Usually Config UI doesn't allow unmasking for security, only overwriting.
                        */}
                    </div>
                  )}
                </TableCell>
                <TableCell className="text-right">
                  {isEditing ? (
                    <div className="flex justify-end gap-2">
                      <Button size="icon" variant="ghost" onClick={() => handleSave(field.key, field.type)} disabled={isSaving} aria-label="Save changes" title="Save changes">
                        <Check className="h-4 w-4 text-green-500" />
                      </Button>
                      <Button size="icon" variant="ghost" onClick={handleCancel} disabled={isSaving} aria-label="Cancel editing" title="Cancel editing">
                        <X className="h-4 w-4 text-red-500" />
                      </Button>
                    </div>
                  ) : (
                    <Button size="icon" variant="ghost" onClick={() => handleEdit(field.key, currentValue)} aria-label="Edit setting" title="Edit setting">
                      <Pencil className="h-4 w-4" />
                    </Button>
                  )}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
