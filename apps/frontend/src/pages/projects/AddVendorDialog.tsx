import React, { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/ui/dialog";
import { Command, CommandInput, CommandList, CommandEmpty, CommandGroup, CommandItem } from "@/ui/command";
import { Button } from "@/ui/button";
import { Input } from "@/ui/input";
import { Label } from "@/ui/label";
import { useSuppliers, useCreateSupplier } from "@/api/useSuppliers";
import { useAddProjectSupplier } from "@/api/useProjects";
import { Plus, Loader2 } from "lucide-react";

interface AddVendorDialogProps {
  isOpen: boolean;
  onClose: () => void;
  projectId: string;
}

export function AddVendorDialog({ isOpen, onClose, projectId }: AddVendorDialogProps) {
  const [view, setView] = useState<"SEARCH" | "CREATE">("SEARCH");
  const { data: suppliers } = useSuppliers();
  const { mutate: linkSupplier, isPending: isLinking } = useAddProjectSupplier();
  const { mutateAsync: createSupplier, isPending: isCreating } = useCreateSupplier();
  
  // Search State
  const [searchQuery, setSearchQuery] = useState("");

  // Create State
  const [newVendor, setNewVendor] = useState({ name: "", categoryName: "", email: "" });

  const handleLink = (supplierId: string) => {
    linkSupplier({
        projectId,
        data: { supplierId, role: "Vendor", status: "NEEDED" } // Default values
    }, {
        onSuccess: onClose
    });
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
        const supplier = await createSupplier({
            name: newVendor.name,
            email: newVendor.email || undefined,
        });
        
        // Auto link after create
        handleLink(supplier.id);
    } catch (err) {
        console.error("Failed to create", err);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-[425px] p-0 gap-0 overflow-hidden bg-surface-card border-border-subtle shadow-soft">
        <DialogHeader className="px-4 py-3 border-b border-border-subtle bg-surface-canvas">
          <DialogTitle className="font-sans text-sm font-medium text-muted-foreground uppercase tracking-wider">
            {view === "SEARCH" ? "Add vendor to project" : "Create new vendor"}
          </DialogTitle>
        </DialogHeader>
        
        {view === "SEARCH" ? (
            <div className="flex flex-col">
                <Command className="border-none shadow-none rounded-none">
                    <CommandInput 
                        placeholder="Search existing vendors..." 
                        value={searchQuery}
                        onValueChange={setSearchQuery}
                        className="border-none focus:ring-0 text-base py-3"
                    />
                    <CommandList className="max-h-[300px] overflow-y-auto p-1">
                        <CommandEmpty className="py-6 text-center text-sm text-muted-foreground">
                            <p>No vendor found.</p>
                            <Button 
                                variant="ghost" 
                                size="sm" 
                                className="mt-2 text-primary hover:text-primary/80"
                                onClick={() => setView("CREATE")}
                            >
                                <Plus className="mr-2 h-4 w-4" />
                                Create "{searchQuery}"
                            </Button>
                        </CommandEmpty>
                        <CommandGroup heading="Recent Vendors">
                            {suppliers?.map((supplier) => (
                                <CommandItem
                                    key={supplier.id}
                                    onSelect={() => handleLink(supplier.id)}
                                    className="flex items-center justify-between px-3 py-2 cursor-pointer aria-selected:bg-surface-hover"
                                >
                                    <div className="flex flex-col">
                                        <span className="font-medium text-foreground">{supplier.name}</span>
                                        <span className="text-xs text-muted-foreground">
                                          {supplier.categories?.find(c => c.isPrimary)?.category?.name || 
                                           supplier.categories?.[0]?.category?.name || 
                                           "No category"}
                                        </span>
                                    </div>
                                    {isLinking && <Loader2 className="h-4 w-4 animate-spin" />}
                                </CommandItem>
                            ))}
                        </CommandGroup>
                    </CommandList>
                </Command>
                <div className="p-2 border-t border-border-subtle bg-surface-canvas">
                    <Button 
                        variant="ghost" 
                        className="w-full justify-start text-muted-foreground hover:text-foreground"
                        onClick={() => setView("CREATE")}
                    >
                        <Plus className="mr-2 h-4 w-4" />
                        Create new vendor
                    </Button>
                </div>
            </div>
        ) : (
            <form onSubmit={handleCreate} className="p-4 space-y-4">
                <div className="space-y-2">
                    <Label htmlFor="name">Name</Label>
                    <Input 
                        id="name" 
                        value={newVendor.name} 
                        onChange={e => setNewVendor({...newVendor, name: e.target.value})}
                        placeholder="Vendor Name" 
                        required
                        className="bg-surface-canvas border-border-subtle focus:ring-primary/20"
                    />
                </div>
                <div className="space-y-2">
                    <Label htmlFor="category">Category</Label>
                    <Input 
                        id="category" 
                        value={newVendor.categoryName} 
                        onChange={e => setNewVendor({...newVendor, categoryName: e.target.value})}
                        placeholder="Florist, Caterer..." 
                        className="bg-surface-canvas border-border-subtle"
                    />
                </div>
                <div className="space-y-2">
                    <Label htmlFor="email">Email</Label>
                    <Input 
                        id="email" 
                        type="email"
                        value={newVendor.email} 
                        onChange={e => setNewVendor({...newVendor, email: e.target.value})}
                        placeholder="hello@vendor.com" 
                        className="bg-surface-canvas border-border-subtle"
                    />
                </div>
                <div className="flex justify-end gap-2 pt-2">
                    <Button type="button" variant="ghost" onClick={() => setView("SEARCH")}>Back</Button>
                    <Button type="submit" disabled={isCreating}>
                        {isCreating ? "Creating..." : "Create & Add"}
                    </Button>
                </div>
            </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
