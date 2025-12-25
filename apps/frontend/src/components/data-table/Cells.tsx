import * as React from "react";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { Badge } from "@/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/ui/popover";
import { Command, CommandInput, CommandList, CommandEmpty, CommandGroup, CommandItem } from "@/ui/command";
import { Check, Plus } from "@phosphor-icons/react";

// --- Cell: Spreadsheet-like wrapper ---
// Provides minimal, clean styling with subtle hover state
interface CellProps {
    children: React.ReactNode;
    className?: string;
    onClick?: () => void;
}
  
export const Cell = ({ children, className, onClick }: CellProps) => {
    return (
        <div 
            onClick={onClick}
            className={cn(
                "flex h-9 w-full items-center px-3 text-sm transition-colors",
                onClick && "cursor-pointer hover:bg-muted/50",
                className
            )}
        >
            <div className="flex-1 truncate">{children}</div>
        </div>
    );
};

// Legacy alias for compatibility
export const InteractiveCell = Cell;

// --- Status Cell ---
export interface StatusOption {
  label: string;
  value: string;  // This is the slug
  color?: string; // Hex color like "#10B981"
}

interface StatusCellProps {
  value: string;
  options: StatusOption[];
  onChange?: (value: string) => void;
  disabled?: boolean;
}

export const StatusCell = ({ value, onChange, options, disabled }: StatusCellProps) => {
  const currentOption = options.find((o) => o.value === value);
  const displayLabel = currentOption?.label || value || "—";
  const displayColor = currentOption?.color || "#6B7280";

  if (disabled || !onChange) {
    return (
      <div className="h-9 w-full flex items-center px-3">
        <Badge 
          variant="outline" 
          className="font-normal rounded-md px-2 py-0.5 border h-5 text-xs"
          style={{ 
            backgroundColor: `${displayColor}15`,
            borderColor: `${displayColor}40`,
            color: displayColor,
          }}
        >
          {displayLabel}
        </Badge>
      </div>
    );
  }

  return (
    <Popover>
      <PopoverTrigger asChild>
        <div className="h-9 w-full flex items-center px-3 cursor-pointer hover:bg-muted/50">
          <Badge 
            variant="outline" 
            className="font-normal rounded-md px-2 py-0.5 border h-5 text-xs transition-all"
            style={{ 
              backgroundColor: `${displayColor}15`,
              borderColor: `${displayColor}40`,
              color: displayColor,
            }}
          >
            {displayLabel}
          </Badge>
        </div>
      </PopoverTrigger>
      <PopoverContent className="p-1 w-[160px]" align="start">
        <div className="flex flex-col gap-0.5 max-h-[300px] overflow-y-auto">
          {options.map((opt) => (
            <button
              key={opt.value}
              onClick={() => onChange(opt.value)}
              className={cn(
                "flex items-center w-full px-2 py-1.5 text-sm rounded-sm hover:bg-accent text-left",
                value === opt.value && "bg-accent"
              )}
            >
              <div 
                className="w-2 h-2 rounded-full mr-2 flex-shrink-0" 
                style={{ backgroundColor: opt.color || "#6B7280" }}
              />
              <span className="truncate">{opt.label}</span>
              {value === opt.value && <Check className="ml-auto h-3 w-3 opacity-60 flex-shrink-0" weight="bold" />}
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
};

// --- Category Cell (Hybrid Suggest + Create) ---
interface CategoryCellProps {
  value: string | null | undefined;
  categories: { id: string; name: string }[];
  onChange?: (categoryName: string) => void;
  onCreateCategory?: (name: string) => void;
}

export const CategoryCell = ({ value, categories, onChange, onCreateCategory }: CategoryCellProps) => {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");

  const filteredCategories = categories.filter(c => 
    c.name.toLowerCase().includes(search.toLowerCase())
  );

  const showCreate = search.trim() && 
    !filteredCategories.some(c => c.name.toLowerCase() === search.trim().toLowerCase());

  const handleSelect = (categoryName: string) => {
    onChange?.(categoryName);
    setOpen(false);
    setSearch("");
  };

  const handleCreate = () => {
    if (search.trim()) {
      onCreateCategory?.(search.trim());
      onChange?.(search.trim());
      setOpen(false);
      setSearch("");
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <div className="h-9 w-full flex items-center px-3 cursor-pointer hover:bg-muted/50">
          {value ? (
            <span className="text-sm truncate">{value}</span>
          ) : (
            <span className="text-sm text-muted-foreground italic">None</span>
          )}
        </div>
      </PopoverTrigger>
      <PopoverContent className="p-0 w-[200px]" align="start">
        <Command shouldFilter={false}>
          <CommandInput 
            placeholder="Search or create..." 
            value={search}
            onValueChange={setSearch}
            className="h-9"
          />
          <CommandList className="max-h-[200px]">
            <CommandEmpty className="py-2 px-3 text-sm text-muted-foreground">
              No categories found.
            </CommandEmpty>
            <CommandGroup>
              {filteredCategories.map((cat) => (
                <CommandItem
                  key={cat.id}
                  onSelect={() => handleSelect(cat.name)}
                  className="flex items-center justify-between cursor-pointer"
                >
                  <span>{cat.name}</span>
                  {value === cat.name && <Check className="h-3 w-3 opacity-60" weight="bold" />}
                </CommandItem>
              ))}
            </CommandGroup>
            {showCreate && (
              <CommandGroup>
                <CommandItem onSelect={handleCreate} className="cursor-pointer">
                  <Plus className="h-3 w-3 mr-2" weight="bold" />
                  Create "{search.trim()}"
                </CommandItem>
              </CommandGroup>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
};
