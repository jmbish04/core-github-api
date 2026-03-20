import React, { useState, useEffect } from "react";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface EditableCellProps {
  value: string;
  onChange: (value: string) => void;
  type?: "text" | "select";
  options?: string[];
  className?: string;
  renderDisplay?: (value: string) => React.ReactNode;
}

export const EditableCell = ({
  value: initialValue,
  onChange,
  type = "text",
  options = [],
  className = "",
  renderDisplay
}: EditableCellProps) => {
  const [value, setValue] = useState(initialValue);
  const [isEditing, setIsEditing] = useState(false);

  useEffect(() => {
    setValue(initialValue);
  }, [initialValue]);

  const commit = () => {
    setIsEditing(false);
    if (value !== initialValue) {
      onChange(value);
    }
  };

  if (isEditing) {
    if (type === "select") {
      return (
        <Select
          value={value}
          onValueChange={(val) => {
            setValue(val);
            onChange(val); // Commit immediately for select
            setIsEditing(false);
          }}
          defaultOpen={true}
          onOpenChange={(open) => { if (!open) setIsEditing(false); }}
        >
          <SelectTrigger className="h-7 w-[120px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {options.map((opt) => (
              <SelectItem key={opt} value={opt} className="capitalize">
                {opt.replace("_", " ")}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      );
    }
    return (
      <Input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onBlur={commit}
        autoFocus
        className={`h-7 px-2 ${className}`}
        onKeyDown={(e) => {
          if (e.key === "Enter") commit();
          if (e.key === "Escape") {
            setValue(initialValue);
            setIsEditing(false);
          }
        }}
      />
    );
  }

  return (
    <div
      onClick={() => setIsEditing(true)}
      className={`cursor-pointer hover:bg-muted/50 rounded px-2 py-1 min-h-[28px] flex items-center ${className}`}
    >
      {renderDisplay ? renderDisplay(value) : value}
    </div>
  );
};
