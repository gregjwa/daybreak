import * as React from "react";
import { cn } from "@/lib/utils";
import { Badge } from "@/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/ui/popover";
import { Button } from "@/ui/button";
import { Pencil, Check } from "lucide-react";

// --- Interactive Cell Wrapper ---
interface InteractiveCellProps {
    children: React.ReactNode;
    className?: string;
    onClick?: () => void;
}
  
export const InteractiveCell = ({ children, className, onClick }: InteractiveCellProps) => {
    return (
        <div 
            onClick={onClick}
            className={cn(
                "group/cell relative flex h-10 w-full items-center px-4 text-sm outline-none transition-colors hover:bg-black/5 focus-within:bg-black/5 cursor-pointer", 
                className
            )}
        >
            <div className="flex-1 truncate">{children}</div>
            {/* Edit Hint Icon - Visible on hover */}
            <Pencil className="absolute right-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground opacity-0 transition-opacity group-hover/cell:opacity-100" />
        </div>
    );
};

// --- Status Cell ---
interface StatusCellProps {
  value: string;
  options?: { label: string; value: string; color?: string }[];
  onChange?: (value: string) => void;
}

const DEFAULT_STATUS_OPTIONS = [
    { label: "Needed", value: "NEEDED", color: "bg-slate-100 text-slate-700 border-slate-200" },
    { label: "Contacted", value: "CONTACTED", color: "bg-blue-50 text-blue-700 border-blue-200" },
    { label: "Quoted", value: "QUOTED", color: "bg-amber-50 text-amber-700 border-amber-200" },
    { label: "Booked", value: "BOOKED", color: "bg-emerald-50 text-emerald-700 border-emerald-200" },
    { label: "Lost", value: "LOST", color: "bg-red-50 text-red-700 border-red-200" },
];

export const StatusCell = ({ value, onChange, options = DEFAULT_STATUS_OPTIONS }: StatusCellProps) => {
  const currentOption = options.find((o) => o.value === value) || { label: value, value, color: "bg-gray-100" };

  // Use a simple Popover or Native Select for better mobile/performance?
  // Shadcn Select is nice but might be heavy for every cell if not virtualized. 
  // Let's use a trigger that looks like a badge.

  return (
    <Popover>
        <PopoverTrigger asChild>
            <div className="h-10 w-full flex items-center px-4 cursor-pointer hover:bg-black/5 group/status">
                <Badge variant="outline" className={cn("font-medium rounded-md px-2 py-0.5 border h-6 transition-all", currentOption.color)}>
                    {currentOption.label}
                </Badge>
            </div>
        </PopoverTrigger>
        <PopoverContent className="p-1 w-[140px]" align="start">
            <div className="flex flex-col gap-1">
                {options.map((opt) => (
                    <button
                        key={opt.value}
                        onClick={() => onChange?.(opt.value)}
                        className={cn(
                            "flex items-center w-full px-2 py-1.5 text-sm rounded-sm hover:bg-accent text-left",
                            value === opt.value && "bg-accent"
                        )}
                    >
                        <div className={cn("w-2 h-2 rounded-full mr-2", opt.color.replace("bg-", "bg-").split(" ")[0])} />
                        {opt.label}
                        {value === opt.value && <Check className="ml-auto h-3 w-3 opacity-50" />}
                    </button>
                ))}
            </div>
        </PopoverContent>
    </Popover>
  );
};

