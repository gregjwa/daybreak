/**
 * Personas Page
 * 
 * Browse and view test personas used for email generation.
 */

import { useState } from "react";
import { usePersonas, useGeneratePersonas, usePersona } from "@/api/useTesting";
import { Button } from "@/ui/button";
import { Input } from "@/ui/input";
import { Card, CardContent } from "@/ui/card";
import { Badge } from "@/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/ui/table";
import { Loader2, Plus, Eye } from "lucide-react";

export default function PersonasPage() {
  const { data: personas, isLoading, refetch } = usePersonas();
  const generateMutation = useGeneratePersonas();
  
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [styleFilter, setStyleFilter] = useState<string>("all");
  const [selectedPersonaId, setSelectedPersonaId] = useState<string | null>(null);

  // Get unique categories
  const categories = [...new Set(personas?.map(p => p.category) || [])].sort();
  const styles = [...new Set(personas?.map(p => p.communicationStyle) || [])].sort();

  // Filter personas
  const filtered = personas?.filter(p => {
    if (search && !p.name.toLowerCase().includes(search.toLowerCase()) &&
        !p.contactName.toLowerCase().includes(search.toLowerCase())) {
      return false;
    }
    if (categoryFilter !== "all" && p.category !== categoryFilter) return false;
    if (styleFilter !== "all" && p.communicationStyle !== styleFilter) return false;
    return true;
  }) || [];

  const handleGenerate = async () => {
    await generateMutation.mutateAsync();
    refetch();
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Test Personas</h1>
          <p className="text-muted-foreground">
            {personas?.length || 0} vendor personas for generating test emails
          </p>
        </div>
        <Button 
          onClick={handleGenerate}
          disabled={generateMutation.isPending}
        >
          {generateMutation.isPending ? (
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          ) : (
            <Plus className="h-4 w-4 mr-2" />
          )}
          Generate Personas
        </Button>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-4">
          <div className="flex gap-4">
            <Input
              placeholder="Search by name..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="max-w-xs"
            />
            <Select value={categoryFilter} onValueChange={setCategoryFilter}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Category" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Categories</SelectItem>
                {categories.map(cat => (
                  <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={styleFilter} onValueChange={setStyleFilter}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Style" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Styles</SelectItem>
                {styles.map(style => (
                  <SelectItem key={style} value={style}>{style}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Table */}
      {isLoading ? (
        <div className="flex justify-center py-8">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Company</TableHead>
                <TableHead>Contact</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>Style</TableHead>
                <TableHead>Reliability</TableHead>
                <TableHead>Price</TableHead>
                <TableHead>Cases</TableHead>
                <TableHead className="w-[100px]">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map(persona => (
                <TableRow key={persona.id} className="cursor-pointer hover:bg-muted/50" onClick={() => setSelectedPersonaId(persona.id)}>
                  <TableCell className="font-medium">{persona.name}</TableCell>
                  <TableCell>{persona.contactName}</TableCell>
                  <TableCell className="text-muted-foreground text-sm">{persona.email}</TableCell>
                  <TableCell>
                    <Badge variant="outline">{persona.category}</Badge>
                  </TableCell>
                  <TableCell>
                    <Badge variant="secondary">{persona.communicationStyle}</Badge>
                  </TableCell>
                  <TableCell>
                    <Badge 
                      variant={persona.reliability === "reliable" ? "default" : persona.reliability === "flaky" ? "outline" : "destructive"}
                    >
                      {persona.reliability}
                    </Badge>
                  </TableCell>
                  <TableCell>{persona.pricePoint}</TableCell>
                  <TableCell>{persona._count?.testCases || 0}</TableCell>
                  <TableCell>
                    <Button 
                      variant="ghost" 
                      size="sm"
                      onClick={(e) => { e.stopPropagation(); setSelectedPersonaId(persona.id); }}
                    >
                      <Eye className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
              {filtered.length === 0 && (
                <TableRow>
                  <TableCell colSpan={9} className="text-center text-muted-foreground py-8">
                    No personas found. Click "Generate Personas" to create them.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </Card>
      )}

      {/* Persona Detail Modal */}
      <PersonaDetailModal 
        personaId={selectedPersonaId}
        onClose={() => setSelectedPersonaId(null)}
      />
    </div>
  );
}

function PersonaDetailModal({ 
  personaId, 
  onClose 
}: { 
  personaId: string | null; 
  onClose: () => void;
}) {
  const { data: persona, isLoading } = usePersona(personaId || undefined);

  if (!personaId) return null;

  return (
    <Dialog open={!!personaId} onOpenChange={() => onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{persona?.name || "Loading..."}</DialogTitle>
        </DialogHeader>

        {isLoading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin" />
          </div>
        ) : persona ? (
          <div className="space-y-6">
            {/* Company Info */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm text-muted-foreground">Company</label>
                <p className="font-medium">{persona.companyName}</p>
              </div>
              <div>
                <label className="text-sm text-muted-foreground">Contact</label>
                <p className="font-medium">{persona.contactName}</p>
              </div>
              <div>
                <label className="text-sm text-muted-foreground">Email</label>
                <p className="font-medium">{persona.email}</p>
              </div>
              <div>
                <label className="text-sm text-muted-foreground">Category</label>
                <p className="font-medium">{persona.category}</p>
              </div>
            </div>

            {/* Traits */}
            <div>
              <label className="text-sm text-muted-foreground block mb-2">Personality Traits</label>
              <div className="flex gap-2">
                <Badge variant="outline">{persona.communicationStyle}</Badge>
                <Badge variant={persona.reliability === "reliable" ? "default" : "destructive"}>
                  {persona.reliability}
                </Badge>
                <Badge variant="secondary">{persona.pricePoint}</Badge>
              </div>
            </div>

            {/* Stats */}
            {persona.stats && (
              <div>
                <label className="text-sm text-muted-foreground block mb-2">Test Statistics</label>
                <div className="grid grid-cols-3 gap-4">
                  <Card>
                    <CardContent className="pt-4 text-center">
                      <p className="text-2xl font-bold">{persona.stats.totalCases}</p>
                      <p className="text-sm text-muted-foreground">Test Cases</p>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="pt-4 text-center">
                      <p className="text-2xl font-bold">{persona.stats.totalTests}</p>
                      <p className="text-sm text-muted-foreground">Tests Run</p>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="pt-4 text-center">
                      <p className="text-2xl font-bold">
                        {persona.stats.passRate != null 
                          ? `${(persona.stats.passRate * 100).toFixed(0)}%` 
                          : "N/A"}
                      </p>
                      <p className="text-sm text-muted-foreground">Pass Rate</p>
                    </CardContent>
                  </Card>
                </div>
              </div>
            )}
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}


