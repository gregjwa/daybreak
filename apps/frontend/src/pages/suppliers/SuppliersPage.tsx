import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useSuppliers, useCreateSupplier } from "@/api/useSuppliers";
import { useSupplierCategories } from "@/api/useSupplierCategories";
import { DataTable } from "@/components/data-table/DataTable";
import { Cell } from "@/components/data-table/Cells";
import { ColumnDef } from "@tanstack/react-table";
import { Button } from "@/ui/button";
import { Input } from "@/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/ui/dialog";
import { Label } from "@/ui/label";
import { Plus, Search, Users } from "lucide-react";
import { Avatar, AvatarFallback } from "@/ui/avatar";
import { Badge } from "@/ui/badge";
import { cn } from "@/lib/utils";

interface SupplierRow {
  id: string;
  name: string;
  category: string | null;
  projectCount: number;
  messageCount: number;
  primaryEmail?: string;
}

export default function SuppliersPage() {
  const navigate = useNavigate();
  const { data: suppliers, isLoading } = useSuppliers();
  const { data: categories } = useSupplierCategories();
  const createSupplier = useCreateSupplier();
  
  const [search, setSearch] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("ALL");
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [newSupplier, setNewSupplier] = useState({ name: "", categoryName: "", email: "" });

  // Transform for table
  const rows = useMemo<SupplierRow[]>(() => {
    if (!suppliers) return [];
    return suppliers.map(s => ({
      id: s.id,
      name: s.name,
      category: s.category?.name || null,
      projectCount: s._count?.projectSuppliers || 0,
      messageCount: s._count?.messages || 0,
      primaryEmail: s.contactMethods.find(c => c.type === "EMAIL" && c.isPrimary)?.value 
        || s.contactMethods.find(c => c.type === "EMAIL")?.value,
    }));
  }, [suppliers]);

  // Filter
  const filteredRows = useMemo(() => {
    return rows.filter(r => {
      const matchesSearch = !search || 
        r.name.toLowerCase().includes(search.toLowerCase()) ||
        r.primaryEmail?.toLowerCase().includes(search.toLowerCase());
      const matchesCategory = selectedCategory === "ALL" || r.category === selectedCategory;
      return matchesSearch && matchesCategory;
    });
  }, [rows, search, selectedCategory]);

  // Category tabs
  const categoryTabs = useMemo(() => {
    const cats = new Set(rows.map(r => r.category).filter(Boolean) as string[]);
    return ["ALL", ...Array.from(cats).sort()];
  }, [rows]);

  // Columns
  const columns: ColumnDef<SupplierRow>[] = [
    {
      accessorKey: "name",
      header: "Name",
      cell: ({ row }) => (
        <Cell className="font-medium">
          <div className="flex items-center gap-3">
            <Avatar className="h-7 w-7 rounded-md">
              <AvatarFallback className="rounded-md text-[10px] bg-primary/10 text-primary font-semibold">
                {row.original.name.substring(0, 2).toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <span>{row.original.name}</span>
          </div>
        </Cell>
      ),
    },
    {
      accessorKey: "category",
      header: "Category",
      cell: ({ row }) => (
        <Cell className="text-muted-foreground">
          {row.original.category || <span className="italic">None</span>}
        </Cell>
      ),
    },
    {
      accessorKey: "primaryEmail",
      header: "Email",
      cell: ({ row }) => (
        <Cell className="text-muted-foreground font-mono text-xs">
          {row.original.primaryEmail || "—"}
        </Cell>
      ),
    },
    {
      accessorKey: "projectCount",
      header: "Projects",
      cell: ({ row }) => (
        <Cell>
          <Badge variant="secondary" className="font-normal">
            {row.original.projectCount}
          </Badge>
        </Cell>
      ),
    },
    {
      accessorKey: "messageCount",
      header: "Messages",
      cell: ({ row }) => (
        <Cell className="text-muted-foreground">
          {row.original.messageCount}
        </Cell>
      ),
    },
  ];

  const handleCreate = async () => {
    if (!newSupplier.name.trim()) return;
    await createSupplier.mutateAsync({
      name: newSupplier.name.trim(),
      categoryName: newSupplier.categoryName.trim() || undefined,
      email: newSupplier.email.trim() || undefined,
    });
    setNewSupplier({ name: "", categoryName: "", email: "" });
    setIsCreateOpen(false);
  };

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-muted-foreground">Loading suppliers...</div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <header className="px-6 py-5 border-b bg-background">
        <div className="flex justify-between items-center">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-primary/10 rounded-lg">
              <Users className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h1 className="text-xl font-display font-semibold tracking-tight">Suppliers</h1>
              <p className="text-sm text-muted-foreground">{rows.length} total</p>
            </div>
          </div>
          <Button onClick={() => setIsCreateOpen(true)} size="sm" className="gap-2">
            <Plus className="h-4 w-4" />
            Add Supplier
          </Button>
        </div>

        {/* Search + Category Tabs */}
        <div className="mt-5 flex flex-col sm:flex-row sm:items-center gap-4">
          <div className="relative w-full sm:w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search suppliers..."
              className="pl-9 h-9"
            />
          </div>
          <div className="flex gap-1 overflow-x-auto no-scrollbar">
            {categoryTabs.map((cat) => (
              <button
                key={cat}
                onClick={() => setSelectedCategory(cat)}
                className={cn(
                  "px-3 py-1.5 text-sm font-medium rounded-md transition-colors whitespace-nowrap",
                  selectedCategory === cat
                    ? "bg-primary/10 text-primary"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                )}
              >
                {cat === "ALL" ? "All" : cat}
              </button>
            ))}
          </div>
        </div>
      </header>

      {/* Table */}
      <main className="flex-1 p-6 overflow-y-auto">
        {filteredRows.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 text-center">
            <Users className="h-12 w-12 text-muted-foreground/30 mb-4" />
            <h3 className="font-medium text-foreground mb-1">No suppliers found</h3>
            <p className="text-sm text-muted-foreground">
              {search ? "Try a different search term" : "Add your first supplier to get started"}
            </p>
          </div>
        ) : (
          <DataTable
            columns={columns}
            data={filteredRows}
            onRowClick={(row) => navigate(`/suppliers/${row.id}`)}
          />
        )}
      </main>

      {/* Create Dialog */}
      <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Supplier</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="name">Name *</Label>
              <Input
                id="name"
                value={newSupplier.name}
                onChange={(e) => setNewSupplier(s => ({ ...s, name: e.target.value }))}
                placeholder="e.g. Blooming Florist"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="category">Category</Label>
              <Input
                id="category"
                value={newSupplier.categoryName}
                onChange={(e) => setNewSupplier(s => ({ ...s, categoryName: e.target.value }))}
                placeholder="e.g. Florist"
                list="category-suggestions"
              />
              <datalist id="category-suggestions">
                {categories?.map(c => (
                  <option key={c.id} value={c.name} />
                ))}
              </datalist>
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                value={newSupplier.email}
                onChange={(e) => setNewSupplier(s => ({ ...s, email: e.target.value }))}
                placeholder="contact@example.com"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsCreateOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleCreate} disabled={!newSupplier.name.trim() || createSupplier.isPending}>
              {createSupplier.isPending ? "Creating..." : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

