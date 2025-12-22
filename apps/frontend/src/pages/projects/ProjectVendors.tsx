import { useMemo, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { useProject } from "@/api/useProjects";
import { DataTable } from "@/components/data-table/DataTable";
import { ColumnDef } from "@tanstack/react-table";
import { Button } from "@/ui/button";
import { InteractiveCell, StatusCell } from "@/components/data-table/Cells";
import { Plus, Filter, LayoutGrid, Mail } from "lucide-react";
import { Avatar, AvatarFallback } from "@/ui/avatar";
import { AddVendorDialog } from "./AddVendorDialog"; 
import { cn } from "@/lib/utils";

// --- Types ---
interface LastMessage {
    id: string;
    content: string;
    direction: string;
    sentAt: string;
}

// Flattened structure for the table
type VendorRow = {
    id: string; // ProjectSupplier ID
    supplierId: string;
    name: string;
    category: string;
    role: string;
    status: string;
    quoteAmount?: number;
    lastMessage?: LastMessage;
    contactMethods?: any[];
};

// Helper to format relative time
function formatRelativeTime(dateString: string): string {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return "Just now";
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString();
}

export default function ProjectVendors() {
    const { projectId } = useParams<{ projectId: string }>();
    const { data: project, isLoading } = useProject(projectId!);
    const [selectedCategory, setSelectedCategory] = useState("ALL");
    const [isAddOpen, setIsAddOpen] = useState(false);

    // Derived Data
    const vendors = useMemo<VendorRow[]>(() => {
        if (!project?.suppliers) return [];
        return project.suppliers.map(ps => {
            // Get the last message from the supplier (if any)
            const supplierData = ps.supplier as any; // Type assertion for messages field
            const lastMessage = supplierData?.messages?.[0] as LastMessage | undefined;
            
            return {
                id: ps.id,
                supplierId: ps.supplierId,
                name: ps.supplier?.name || "Unknown",
                category: ps.supplier?.category || "Uncategorized",
                role: ps.role,
                status: ps.status,
                quoteAmount: ps.quoteAmount,
                lastMessage,
                contactMethods: ps.supplier?.contactMethods
            };
        });
    }, [project]);

    const filteredVendors = useMemo(() => {
        if (selectedCategory === "ALL") return vendors;
        return vendors.filter(v => v.category === selectedCategory);
    }, [vendors, selectedCategory]);

    const categories = useMemo(() => {
        const cats = new Set(vendors.map(v => v.category));
        return ["ALL", ...Array.from(cats)];
    }, [vendors]);

    // Define Columns
    const columns: ColumnDef<VendorRow>[] = [
        {
            accessorKey: "name",
            header: "Name",
            cell: ({ row }) => (
                <InteractiveCell className="font-medium text-foreground">
                    <div className="flex items-center gap-3">
                        <Avatar className="h-6 w-6 rounded-md">
                            <AvatarFallback className="rounded-md text-[10px] bg-primary/10 text-primary">
                                {row.original.name.substring(0, 2).toUpperCase()}
                            </AvatarFallback>
                        </Avatar>
                        {row.original.name}
                    </div>
                </InteractiveCell>
            )
        },
        {
            accessorKey: "category",
            header: "Category",
            cell: ({ row }) => <InteractiveCell>{row.original.category}</InteractiveCell>
        },
        {
            accessorKey: "status",
            header: "Status",
            cell: ({ row }) => (
                <StatusCell 
                    value={row.original.status} 
                    onChange={(val) => console.log("Update status", row.original.id, val)}
                />
            )
        },
        {
            accessorKey: "lastCommunication",
            header: "Last Communication",
            cell: ({ row }) => {
                const msg = row.original.lastMessage;
                if (!msg) {
                    return <InteractiveCell className="text-muted-foreground">No messages yet</InteractiveCell>;
                }
                
                const preview = msg.content.length > 50 
                    ? msg.content.substring(0, 50) + "..." 
                    : msg.content;
                const timeAgo = formatRelativeTime(msg.sentAt);
                const isInbound = msg.direction === "INBOUND";
                
                return (
                    <InteractiveCell className="text-foreground">
                        <div className="flex items-center gap-2">
                            <Mail className={cn(
                                "h-3.5 w-3.5 flex-shrink-0",
                                isInbound ? "text-blue-500" : "text-emerald-500"
                            )} />
                            <span className="truncate text-sm">{preview}</span>
                            <span className="text-xs text-muted-foreground whitespace-nowrap">{timeAgo}</span>
                        </div>
                    </InteractiveCell>
                );
            }
        }
    ];

    if (isLoading) return <div className="p-8">Loading...</div>;

    // "Choice" vendor logic (e.g. status === BOOKED)
    const bookedVendors = filteredVendors.filter(v => v.status === "BOOKED");
    const potentialVendors = filteredVendors.filter(v => v.status !== "BOOKED");

    return (
        <div className="flex flex-col h-full bg-surface-canvas min-h-screen">
            {/* Header */}
            <header className="px-8 py-6 border-b border-border-subtle bg-surface-canvas sticky top-0 z-10">
                <div className="flex items-center gap-2 text-sm text-muted-foreground mb-2">
                    <Link to="/projects" className="hover:text-foreground transition-colors">Projects</Link>
                    <span>/</span>
                    <span>{project?.name}</span>
                </div>
                <div className="flex justify-between items-end">
                    <h1 className="text-3xl font-display font-medium text-foreground tracking-tight">Vendors</h1>
                    <div className="flex gap-2">
                         <Button variant="outline" size="sm" className="h-8 gap-2">
                            <Filter className="h-4 w-4" />
                            Filter
                        </Button>
                        <Button variant="outline" size="sm" className="h-8 gap-2">
                            <LayoutGrid className="h-4 w-4" />
                            View
                        </Button>
                    </div>
                </div>
                
                {/* Tabs */}
                <div className="mt-8 flex items-center gap-4 overflow-x-auto no-scrollbar">
                    {categories.map(cat => (
                        <button
                            key={cat}
                            onClick={() => setSelectedCategory(cat)}
                            className={cn(
                                "px-3 py-1.5 text-sm font-medium transition-all relative whitespace-nowrap",
                                selectedCategory === cat 
                                    ? "text-primary" 
                                    : "text-muted-foreground hover:text-foreground"
                            )}
                        >
                            {cat === "ALL" ? "All Vendors" : cat}
                            {selectedCategory === cat && (
                                <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary rounded-full" />
                            )}
                        </button>
                    ))}
                </div>
            </header>

            {/* Main Content */}
            <main className="flex-1 p-8 overflow-y-auto space-y-8">
                
                {/* Section 1: Booked / Choice */}
                {bookedVendors.length > 0 && (
                    <section className="space-y-3">
                        <div className="flex items-center gap-2">
                            <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Choice Vendor</h2>
                            <div className="h-px bg-border-subtle flex-1" />
                        </div>
                        <div className="rounded-lg border-l-4 border-l-emerald-500 border border-border-subtle bg-surface-card shadow-sm overflow-hidden">
                             {/* Reusing table for booked, but could be a specific card layout */}
                             <DataTable columns={columns} data={bookedVendors} />
                        </div>
                    </section>
                )}

                {/* Section 2: Quote Array */}
                <section className="space-y-3">
                    <div className="flex items-center gap-2">
                        <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Quote Array</h2>
                        <div className="h-px bg-border-subtle flex-1" />
                    </div>
                    
                    <DataTable columns={columns} data={potentialVendors} />
                    
                    {/* Add Vendor Trigger */}
                    <button 
                        onClick={() => setIsAddOpen(true)}
                        className="flex items-center gap-2 text-sm text-muted-foreground hover:text-primary transition-colors px-4 py-2 mt-2 -ml-4 rounded-md hover:bg-surface-hover w-full md:w-auto"
                    >
                        <Plus className="h-4 w-4" />
                        Add vendor
                    </button>
                </section>
            </main>

            <AddVendorDialog 
                isOpen={isAddOpen} 
                onClose={() => setIsAddOpen(false)} 
                projectId={projectId!} 
            />
        </div>
    );
}
