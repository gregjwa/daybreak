import {
  ColumnDef,
  flexRender,
  getCoreRowModel,
  useReactTable,
} from "@tanstack/react-table";
import { cn } from "@/lib/utils";

interface DataTableProps<TData, TValue> {
  columns: ColumnDef<TData, TValue>[];
  data: TData[];
  onRowClick?: (row: TData) => void;
  className?: string;
}

export function DataTable<TData, TValue>({
  columns,
  data,
  onRowClick,
  className,
}: DataTableProps<TData, TValue>) {
  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
  });

  return (
    <div className={cn("w-full overflow-hidden rounded-md border border-border bg-card", className)}>
      <table className="w-full caption-bottom text-sm border-collapse">
        <thead className="bg-muted/30 border-b">
          {table.getHeaderGroups().map((headerGroup) => (
            <tr key={headerGroup.id}>
              {headerGroup.headers.map((header, idx) => {
                return (
                  <th
                    key={header.id}
                    className={cn(
                      "h-9 px-3 text-left align-middle font-sans text-[11px] font-medium text-muted-foreground uppercase tracking-wider",
                      idx > 0 && "border-l border-border/50"
                    )}
                  >
                    {header.isPlaceholder
                      ? null
                      : flexRender(
                          header.column.columnDef.header,
                          header.getContext()
                        )}
                  </th>
                );
              })}
            </tr>
          ))}
        </thead>
        <tbody className="[&_tr:last-child]:border-0">
          {table.getRowModel().rows?.length ? (
            table.getRowModel().rows.map((row) => (
              <tr
                key={row.id}
                onClick={() => onRowClick?.(row.original)}
                className={cn(
                  "border-b border-border/50 transition-colors",
                  "hover:bg-muted/40",
                  onRowClick && "cursor-pointer"
                )}
              >
                {row.getVisibleCells().map((cell, idx) => (
                  <td
                    key={cell.id}
                    className={cn(
                      "p-0 align-middle",
                      idx > 0 && "border-l border-border/50"
                    )}
                  >
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </td>
                ))}
              </tr>
            ))
          ) : (
            <tr>
              <td colSpan={columns.length} className="h-24 text-center text-muted-foreground">
                No results.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
