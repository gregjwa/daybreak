import { useState } from "react";
import { useParams, Navigate } from "react-router-dom";
import { useAuth, SignedIn, SignedOut, SignInButton } from "@clerk/clerk-react";
import { useValidateInvite, useAcceptInvite } from "@/api/useInvites";
import { Button } from "@/ui/button";
import { Input } from "@/ui/input";
import { Label } from "@/ui/label";
import { Card } from "@/ui/card";
import { Badge } from "@/ui/badge";

const InviteAcceptPage = () => {
  const { code } = useParams<{ code: string }>();
  const { isSignedIn } = useAuth();
  const [name, setName] = useState("");
  const [selectedRoles, setSelectedRoles] = useState<string[]>([]);

  const {
    data: inviteData,
    isLoading: isValidating,
    error: validateError,
  } = useValidateInvite(code || "");

  const {
    mutate: acceptInvite,
    isPending: isAccepting,
    isSuccess,
    error: acceptError,
  } = useAcceptInvite();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!code || !name.trim()) return;

    acceptInvite({
      inviteCode: code,
      name: name.trim(),
      roles: inviteData?.invite.inviteType === "PERSON" ? selectedRoles : undefined,
    });
  };

  const toggleRole = (role: string) => {
    setSelectedRoles((prev) =>
      prev.includes(role) ? prev.filter((r) => r !== role) : [...prev, role]
    );
  };

  // Redirect to welcome page after successful acceptance
  if (isSuccess) {
    return <Navigate to="/welcome" replace />;
  }

  if (isValidating) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Card className="p-6">
          <p>Validating invite...</p>
        </Card>
      </div>
    );
  }

  if (validateError || !inviteData?.valid) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Card className="p-6 max-w-md">
          <h2 className="text-2xl font-semibold mb-2 text-destructive">
            Invalid Invite
          </h2>
          <p className="text-muted-foreground">
            {validateError?.message ||
              "This invite link is invalid, expired, or has already been used."}
          </p>
        </Card>
      </div>
    );
  }

  const { invite } = inviteData;

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <Card className="p-6 max-w-md w-full">
        <div className="mb-6">
          <h2 className="text-2xl font-semibold mb-2">You've Been Invited!</h2>
          <p className="text-muted-foreground">
            {invite.senderBusiness && (
              <>
                <span className="font-medium">{invite.senderBusiness}</span> has
                invited you to join as a{" "}
              </>
            )}
            {invite.inviteType === "PERSON" ? (
              <span className="font-medium">team member</span>
            ) : (
              <span className="font-medium">partner business</span>
            )}
            .
          </p>
        </div>

        <div className="mb-6 flex items-center gap-2">
          <Badge variant="secondary">
            {invite.inviteType === "PERSON" ? "Team Member" : "Partner Business"}
          </Badge>
          {invite.email && (
            <Badge variant="outline">
              For: {invite.email}
            </Badge>
          )}
        </div>

        <SignedOut>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Sign in with Google to accept this invite and link your calendar.
            </p>
            <SignInButton mode="modal">
              <Button className="w-full">Sign In with Google to Accept</Button>
            </SignInButton>
          </div>
        </SignedOut>

        <SignedIn>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">
                {invite.inviteType === "PERSON" ? "Your Name" : "Business Name"}
              </Label>
              <Input
                id="name"
                type="text"
                placeholder={
                  invite.inviteType === "PERSON"
                    ? "e.g., John Engineer"
                    : "e.g., Partner Studio Inc"
                }
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                disabled={isAccepting}
              />
            </div>

            {invite.inviteType === "PERSON" && (
              <div className="space-y-2">
                <Label>Select Your Roles</Label>
                <div className="flex flex-wrap gap-2">
                  {["ENGINEER", "ASSISTANT"].map((role) => (
                    <Badge
                      key={role}
                      variant={selectedRoles.includes(role) ? "default" : "outline"}
                      className="cursor-pointer"
                      onClick={() => toggleRole(role)}
                    >
                      {role}
                    </Badge>
                  ))}
                </div>
                {selectedRoles.length === 0 && (
                  <p className="text-xs text-muted-foreground">
                    Select at least one role
                  </p>
                )}
              </div>
            )}

            {acceptError && (
              <div className="text-sm text-destructive">
                {acceptError.message}
              </div>
            )}

            <Button
              type="submit"
              className="w-full"
              disabled={
                isAccepting ||
                !name.trim() ||
                (invite.inviteType === "PERSON" && selectedRoles.length === 0)
              }
            >
              {isAccepting ? "Accepting..." : "Accept Invite"}
            </Button>
          </form>
        </SignedIn>

        <div className="mt-4 text-xs text-muted-foreground text-center">
          Expires: {new Date(invite.expiresAt).toLocaleDateString()}
        </div>
      </Card>
    </div>
  );
};

export default InviteAcceptPage;

