/**
 * Email Sets Page
 * 
 * List and manage versioned test email sets.
 */

import { useState } from "react";
import { Link } from "react-router-dom";
import { useEmailSets, useCreateEmailSet, useGenerateEmails } from "@/api/useTesting";
import { Button } from "@/ui/button";
import { Input } from "@/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/ui/card";
import { Badge } from "@/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/ui/dialog";
import { Label } from "@/ui/label";
import { Textarea } from "@/ui/textarea";
import { Loader2, Plus, ArrowRight, Mail, Play } from "lucide-react";

export default function EmailSetsPage() {
  const { data: emailSets, isLoading, refetch } = useEmailSets();
  const createMutation = useCreateEmailSet();
  const generateMutation = useGenerateEmails();

  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [newSetName, setNewSetName] = useState("");
  const [newSetDescription, setNewSetDescription] = useState("");
  const [generatingId, setGeneratingId] = useState<string | null>(null);

  const handleCreate = async () => {
    if (!newSetName) return;
    await createMutation.mutateAsync({ name: newSetName, description: newSetDescription });
    setIsCreateOpen(false);
    setNewSetName("");
    setNewSetDescription("");
    refetch();
  };

  const handleGenerate = async (setId: string) => {
    setGeneratingId(setId);
    try {
      await generateMutation.mutateAsync({ id: setId, count: 500, useAI: true });
      refetch();
    } finally {
      setGeneratingId(null);
    }
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Email Sets</h1>
          <p className="text-muted-foreground">
            Versioned collections of test emails for status detection testing
          </p>
        </div>
        
        <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="h-4 w-4 mr-2" />
              New Email Set
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create Email Set</DialogTitle>
              <DialogDescription>
                Create a new versioned email set for testing
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="name">Name</Label>
                <Input
                  id="name"
                  placeholder="v1-initial"
                  value={newSetName}
                  onChange={(e) => setNewSetName(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="description">Description</Label>
                <Textarea
                  id="description"
                  placeholder="Describe this email set..."
                  value={newSetDescription}
                  onChange={(e) => setNewSetDescription(e.target.value)}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsCreateOpen(false)}>
                Cancel
              </Button>
              <Button 
                onClick={handleCreate}
                disabled={!newSetName || createMutation.isPending}
              >
                {createMutation.isPending && (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                )}
                Create
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-8">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : emailSets?.length === 0 ? (
        <Card className="py-12">
          <CardContent className="text-center">
            <Mail className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">No Email Sets</h3>
            <p className="text-muted-foreground mb-4">
              Create your first email set to start testing
            </p>
            <Button onClick={() => setIsCreateOpen(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Create Email Set
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {emailSets?.map(set => (
            <Card key={set.id}>
              <CardHeader>
                <CardTitle className="flex items-center justify-between">
                  {set.name}
                  <Badge variant="outline">{set.totalCases} emails</Badge>
                </CardTitle>
                <CardDescription>
                  {set.description || "No description"}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex gap-4 text-sm">
                  <div>
                    <span className="text-muted-foreground">Inbound:</span>{" "}
                    <span className="font-medium">{set.inboundCount}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Outbound:</span>{" "}
                    <span className="font-medium">{set.outboundCount}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Runs:</span>{" "}
                    <span className="font-medium">{set._count?.runs || 0}</span>
                  </div>
                </div>
                
                <div className="flex gap-2">
                  {set.totalCases === 0 ? (
                    <Button 
                      variant="default" 
                      className="flex-1"
                      onClick={() => handleGenerate(set.id)}
                      disabled={generatingId === set.id}
                    >
                      {generatingId === set.id ? (
                        <>
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                          Generating...
                        </>
                      ) : (
                        <>
                          <Play className="h-4 w-4 mr-2" />
                          Generate 500 Emails
                        </>
                      )}
                    </Button>
                  ) : (
                    <Button variant="outline" className="flex-1" asChild>
                      <Link to={`/dev/testing/email-sets/${set.id}`}>
                        View Emails
                        <ArrowRight className="h-4 w-4 ml-2" />
                      </Link>
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}


