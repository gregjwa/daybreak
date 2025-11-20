import { useState } from "react";
import { useCreateInvite } from "@/api/useInvites";
import { Button } from "@/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/ui/dialog";
import { Input } from "@/ui/input";
import { Label } from "@/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/ui/select";
import { Badge } from "@/ui/badge";

interface CreateInviteDialogProps {
  children?: React.ReactNode;
}

const CreateInviteDialog = ({ children }: CreateInviteDialogProps) => {
  const [open, setOpen] = useState(false);
  const [inviteType, setInviteType] = useState<"PERSON" | "BUSINESS">(
    "PERSON"
  );
  const [email, setEmail] = useState("");
  const [expiresInDays, setExpiresInDays] = useState("7");
  const [generatedInvite, setGeneratedInvite] = useState<{
    code: string;
    inviteUrl: string;
  } | null>(null);

  const { mutate: createInvite, isPending, error } = useCreateInvite();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    createInvite(
      {
        inviteType,
        email: email.trim() || undefined,
        expiresInDays: parseInt(expiresInDays),
      },
      {
        onSuccess: (data) => {
          setGeneratedInvite({
            code: data.invite.code,
            inviteUrl: data.invite.inviteUrl,
          });
        },
      }
    );
  };

  const handleClose = () => {
    setOpen(false);
    // Reset form after a delay
    setTimeout(() => {
      setGeneratedInvite(null);
      setEmail("");
      setInviteType("PERSON");
      setExpiresInDays("7");
    }, 300);
  };

  const copyToClipboard = () => {
    if (generatedInvite) {
      navigator.clipboard.writeText(generatedInvite.inviteUrl);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {children || <Button>Create Invite</Button>}
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Create Invite Link</DialogTitle>
          <DialogDescription>
            Generate an invite link to add team members or partner businesses.
          </DialogDescription>
        </DialogHeader>

        {!generatedInvite ? (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="inviteType">Invite Type</Label>
              <Select
                value={inviteType}
                onValueChange={(value: "PERSON" | "BUSINESS") =>
                  setInviteType(value)
                }
              >
                <SelectTrigger id="inviteType">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="PERSON">Person (Team Member)</SelectItem>
                  <SelectItem value="BUSINESS">Partner Business</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                {inviteType === "PERSON"
                  ? "Invite an engineer, assistant, or other team member"
                  : "Invite a partner studio to share calendars"}
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="email">Email (Optional)</Label>
              <Input
                id="email"
                type="email"
                placeholder="teammate@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={isPending}
              />
              <p className="text-xs text-muted-foreground">
                Leave blank for a generic invite link
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="expiresInDays">Expires In (Days)</Label>
              <Select
                value={expiresInDays}
                onValueChange={setExpiresInDays}
              >
                <SelectTrigger id="expiresInDays">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="1">1 day</SelectItem>
                  <SelectItem value="3">3 days</SelectItem>
                  <SelectItem value="7">7 days</SelectItem>
                  <SelectItem value="14">14 days</SelectItem>
                  <SelectItem value="30">30 days</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {error && (
              <div className="text-sm text-destructive">{error.message}</div>
            )}

            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={handleClose}
                disabled={isPending}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={isPending}>
                {isPending ? "Generating..." : "Generate Invite"}
              </Button>
            </div>
          </form>
        ) : (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Invite Code</Label>
              <div className="flex items-center gap-2">
                <Badge variant="secondary" className="text-base px-3 py-1">
                  {generatedInvite.code}
                </Badge>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Invite URL</Label>
              <div className="flex gap-2">
                <Input
                  value={generatedInvite.inviteUrl}
                  readOnly
                  className="font-mono text-sm"
                />
                <Button
                  type="button"
                  variant="outline"
                  onClick={copyToClipboard}
                >
                  Copy
                </Button>
              </div>
            </div>

            <div className="bg-muted p-3 rounded-md text-sm">
              <p className="text-muted-foreground">
                Share this link with your team member or partner. They'll be
                able to sign in and join your business.
              </p>
            </div>

            <Button onClick={handleClose} className="w-full">
              Done
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default CreateInviteDialog;

