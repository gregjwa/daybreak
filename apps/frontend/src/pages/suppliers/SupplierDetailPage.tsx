import { useMemo, useState } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { useSupplier, useUpdateSupplier } from "@/api/useSuppliers";
import { Button } from "@/ui/button";
import { Input } from "@/ui/input";
import { Badge } from "@/ui/badge";
import { Avatar, AvatarFallback } from "@/ui/avatar";
import {
  ArrowLeft,
  Mail,
  Phone,
  Building2,
  Calendar,
  MessageSquare,
  Edit2,
  Check,
  X,
  ExternalLink,
} from "lucide-react";
import { cn } from "@/lib/utils";

// Helper: format relative time
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

// Helper: format date
function formatDate(dateString: string | null | undefined): string {
  if (!dateString) return "—";
  return new Date(dateString).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export default function SupplierDetailPage() {
  const { supplierId } = useParams<{ supplierId: string }>();
  const navigate = useNavigate();
  const { data: supplier, isLoading, error } = useSupplier(supplierId);
  const updateSupplier = useUpdateSupplier();

  const [isEditingName, setIsEditingName] = useState(false);
  const [editName, setEditName] = useState("");

  const primaryEmail = useMemo(() => {
    return (
      supplier?.contactMethods.find((c) => c.type === "EMAIL" && c.isPrimary)?.value ||
      supplier?.contactMethods.find((c) => c.type === "EMAIL")?.value
    );
  }, [supplier]);

  const primaryPhone = useMemo(() => {
    return (
      supplier?.contactMethods.find((c) => c.type === "PHONE" && c.isPrimary)?.value ||
      supplier?.contactMethods.find((c) => c.type === "PHONE")?.value
    );
  }, [supplier]);

  const handleSaveName = async () => {
    if (!editName.trim() || !supplierId) return;
    await updateSupplier.mutateAsync({ id: supplierId, data: { name: editName.trim() } });
    setIsEditingName(false);
  };

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-muted-foreground">Loading...</div>
      </div>
    );
  }

  if (error || !supplier) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4">
        <div className="text-muted-foreground">Supplier not found</div>
        <Button variant="outline" onClick={() => navigate("/suppliers")}>
          Back to Suppliers
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Top Nav */}
      <header className="flex items-center gap-4 px-6 py-4 border-b bg-background">
        <Button variant="ghost" size="icon" onClick={() => navigate("/suppliers")} className="h-8 w-8">
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Link to="/suppliers" className="hover:text-foreground transition-colors">
            Suppliers
          </Link>
          <span>/</span>
          <span className="text-foreground font-medium">{supplier.name}</span>
        </div>
      </header>

      {/* Main Content */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-6xl mx-auto p-6">
          {/* Profile Header */}
          <div className="flex items-start gap-6 mb-8">
            <Avatar className="h-20 w-20 rounded-xl">
              <AvatarFallback className="rounded-xl text-2xl font-display font-semibold bg-primary/10 text-primary">
                {supplier.name.substring(0, 2).toUpperCase()}
              </AvatarFallback>
            </Avatar>

            <div className="flex-1 min-w-0">
              {/* Editable Name */}
              {isEditingName ? (
                <div className="flex items-center gap-2 mb-2">
                  <Input
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    className="text-2xl font-display font-semibold h-10 max-w-md"
                    autoFocus
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleSaveName();
                      if (e.key === "Escape") setIsEditingName(false);
                    }}
                  />
                  <Button size="icon" variant="ghost" onClick={handleSaveName} className="h-8 w-8">
                    <Check className="h-4 w-4" />
                  </Button>
                  <Button size="icon" variant="ghost" onClick={() => setIsEditingName(false)} className="h-8 w-8">
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              ) : (
                <h1
                  onClick={() => {
                    setEditName(supplier.name);
                    setIsEditingName(true);
                  }}
                  className="text-2xl font-display font-semibold tracking-tight mb-2 cursor-pointer hover:text-primary transition-colors inline-flex items-center gap-2 group"
                >
                  {supplier.name}
                  <Edit2 className="h-4 w-4 opacity-0 group-hover:opacity-50 transition-opacity" />
                </h1>
              )}

              {/* Category */}
              {supplier.category ? (
                <Badge variant="secondary" className="font-normal">
                  {supplier.category.name}
                </Badge>
              ) : (
                <span className="text-sm text-muted-foreground italic">No category</span>
              )}

              {/* Contact Info Row */}
              <div className="flex flex-wrap gap-4 mt-4 text-sm">
                {primaryEmail && (
                  <a
                    href={`mailto:${primaryEmail}`}
                    className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors"
                  >
                    <Mail className="h-4 w-4" />
                    {primaryEmail}
                  </a>
                )}
                {primaryPhone && (
                  <a
                    href={`tel:${primaryPhone}`}
                    className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors"
                  >
                    <Phone className="h-4 w-4" />
                    {primaryPhone}
                  </a>
                )}
              </div>
            </div>
          </div>

          {/* Two Column Layout */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            {/* Left Column - Details */}
            <div className="lg:col-span-1 space-y-6">
              {/* Contact Methods */}
              <section className="rounded-lg border bg-card p-5">
                <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider mb-4">
                  Contact Methods
                </h3>
                {supplier.contactMethods.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No contact methods</p>
                ) : (
                  <div className="space-y-3">
                    {supplier.contactMethods.map((cm) => (
                      <div key={cm.id} className="flex items-center gap-3">
                        <div className="p-2 rounded-md bg-muted">
                          {cm.type === "EMAIL" ? (
                            <Mail className="h-4 w-4 text-muted-foreground" />
                          ) : cm.type === "PHONE" ? (
                            <Phone className="h-4 w-4 text-muted-foreground" />
                          ) : (
                            <MessageSquare className="h-4 w-4 text-muted-foreground" />
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium truncate">{cm.value}</div>
                          <div className="text-xs text-muted-foreground">
                            {cm.label || cm.type}
                            {cm.isPrimary && " • Primary"}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </section>

              {/* Notes */}
              {supplier.notes && (
                <section className="rounded-lg border bg-card p-5">
                  <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider mb-3">
                    Notes
                  </h3>
                  <p className="text-sm text-foreground whitespace-pre-wrap">{supplier.notes}</p>
                </section>
              )}
            </div>

            {/* Right Column - Projects + Messages */}
            <div className="lg:col-span-2 space-y-6">
              {/* Projects */}
              <section className="rounded-lg border bg-card">
                <div className="px-5 py-4 border-b flex items-center justify-between">
                  <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
                    Projects ({supplier.projectSuppliers.length})
                  </h3>
                </div>
                {supplier.projectSuppliers.length === 0 ? (
                  <div className="p-5 text-center text-sm text-muted-foreground">
                    Not associated with any projects yet
                  </div>
                ) : (
                  <div className="divide-y">
                    {supplier.projectSuppliers.map((ps) => (
                      <Link
                        key={ps.id}
                        to={`/projects/${ps.project.id}/vendors`}
                        className="flex items-center gap-4 px-5 py-4 hover:bg-muted/50 transition-colors group"
                      >
                        <div className="p-2 rounded-md bg-muted">
                          <Building2 className="h-4 w-4 text-muted-foreground" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="font-medium text-sm group-hover:text-primary transition-colors">
                            {ps.project.name}
                          </div>
                          <div className="text-xs text-muted-foreground flex items-center gap-2">
                            <span>{ps.project.type}</span>
                            {ps.project.date && (
                              <>
                                <span>•</span>
                                <Calendar className="h-3 w-3" />
                                <span>{formatDate(ps.project.date)}</span>
                              </>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          <Badge
                            variant="outline"
                            className={cn(
                              "text-xs",
                              ps.status === "BOOKED" && "bg-emerald-50 text-emerald-700 border-emerald-200",
                              ps.status === "QUOTED" && "bg-amber-50 text-amber-700 border-amber-200",
                              ps.status === "CONTACTED" && "bg-blue-50 text-blue-700 border-blue-200",
                              ps.status === "NEEDED" && "bg-slate-100 text-slate-700 border-slate-200"
                            )}
                          >
                            {ps.status}
                          </Badge>
                          <ExternalLink className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                        </div>
                      </Link>
                    ))}
                  </div>
                )}
              </section>

              {/* Recent Messages */}
              <section className="rounded-lg border bg-card">
                <div className="px-5 py-4 border-b">
                  <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
                    Recent Messages
                  </h3>
                </div>
                {supplier.messages.length === 0 ? (
                  <div className="p-5 text-center text-sm text-muted-foreground">
                    No messages yet
                  </div>
                ) : (
                  <div className="divide-y max-h-96 overflow-y-auto">
                    {supplier.messages.map((msg) => (
                      <div key={msg.id} className="px-5 py-4">
                        <div className="flex items-start gap-3">
                          <div
                            className={cn(
                              "mt-1 p-1.5 rounded-md",
                              msg.direction === "INBOUND" ? "bg-blue-50" : "bg-emerald-50"
                            )}
                          >
                            <Mail
                              className={cn(
                                "h-3.5 w-3.5",
                                msg.direction === "INBOUND" ? "text-blue-600" : "text-emerald-600"
                              )}
                            />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              <span className="text-xs font-medium text-muted-foreground">
                                {msg.direction === "INBOUND" ? "Received" : "Sent"}
                              </span>
                              <span className="text-xs text-muted-foreground">
                                {formatRelativeTime(msg.sentAt)}
                              </span>
                              {msg.project && (
                                <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                                  {msg.project.name}
                                </Badge>
                              )}
                            </div>
                            <p className="text-sm text-foreground line-clamp-3">{msg.content}</p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </section>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

