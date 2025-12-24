import { useEffect } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { useInvitePublic, useAcceptInvite } from "@/api/useInvites";
import { useAuth, SignInButton, SignUpButton } from "@clerk/clerk-react";
import { Button } from "@/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/ui/card";
import { Skeleton } from "@/ui/skeleton";
import { ArrowRight, CheckCircle, XCircle } from "@phosphor-icons/react";
import { toast } from "sonner";

export default function InviteLandingPage() {
  const { token } = useParams<{ token: string }>();
  const { data: invite, isLoading, error } = useInvitePublic(token!);
  const { mutate: acceptInvite, isPending: isAccepting } = useAcceptInvite();
  const { isSignedIn, isLoaded } = useAuth();
  const navigate = useNavigate();

  const handleAccept = () => {
    if (!token) return;
    acceptInvite(token, {
      onSuccess: (data) => {
        toast.success("Welcome to the organization!");
        navigate(`/organizations/${data.organizationId}`);
      },
      onError: (err) => {
        toast.error(err.message);
      },
    });
  };

  // Auto-trigger accept if signed in and valid invite
  // For now, let's just update the sign-in/up buttons to force redirect to current URL.
  // Note: location.pathname includes /invite/:token
  // Use href to ensure absolute path for reliable redirect
  const redirectUrl = window.location.href;

  // Persist token in sessionStorage if not signed in
  useEffect(() => {
    if (!isSignedIn && token) {
      sessionStorage.setItem("pendingInviteToken", token);
    } else if (isSignedIn) {
      sessionStorage.removeItem("pendingInviteToken");
    }
  }, [isSignedIn, token]);

  useEffect(() => {
    if (isLoaded && isSignedIn && invite && !isAccepting && !error) {
      // Auto-accept to streamline UX
      handleAccept();
    }
  }, [isLoaded, isSignedIn, invite, isAccepting, error]);

  if (isLoading || !isLoaded) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-muted/20 p-4">
        <Card className="w-full max-w-md text-center">
          <CardHeader>
            <Skeleton className="h-8 w-3/4 mx-auto" />
            <Skeleton className="h-4 w-1/2 mx-auto mt-2" />
          </CardHeader>
          <CardContent>
            <Skeleton className="h-20 w-full" />
          </CardContent>
        </Card>
      </div>
    );
  }

  if (error || !invite) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-muted/20 p-4">
        <Card className="w-full max-w-md text-center border-destructive/50 bg-destructive/5">
          <CardHeader>
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10 mb-4">
              <XCircle className="h-6 w-6 text-destructive" weight="fill" />
            </div>
            <CardTitle className="text-destructive">Invalid Invite</CardTitle>
            <CardDescription>
              This invite link is invalid, expired, or has already been used.
            </CardDescription>
          </CardHeader>
          <CardFooter className="justify-center">
            <Button asChild variant="outline">
              <Link to="/">Return Home</Link>
            </Button>
          </CardFooter>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/20 p-4">
      <Card className="w-full max-w-md text-center">
        <CardHeader>
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 mb-4">
            <CheckCircle className="h-6 w-6 text-primary" weight="fill" />
          </div>
          <CardTitle className="text-2xl">You've been invited!</CardTitle>
          <CardDescription>
            Join{" "}
            <span className="font-semibold text-foreground">
              {invite.organizationName}
            </span>
            {invite.roleName && (
              <span>
                {" "}
                as{" "}
                <span className="font-medium text-foreground">
                  {invite.roleName}
                </span>
              </span>
            )}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-lg border bg-card p-4 text-card-foreground shadow-sm">
            <p className="text-sm text-muted-foreground mb-1">Invited Email</p>
            <p className="font-medium">{invite.email}</p>
          </div>

          {!isSignedIn ? (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                Please sign in or create an account to accept this invitation.
              </p>
              <div className="grid grid-cols-2 gap-3">
                <SignInButton mode="modal" forceRedirectUrl={redirectUrl}>
                  <Button variant="outline" className="w-full">
                    Sign In
                  </Button>
                </SignInButton>
                <SignUpButton mode="modal" forceRedirectUrl={redirectUrl}>
                  <Button className="w-full">Sign Up</Button>
                </SignUpButton>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                You are signed in. Ready to join?
              </p>
              <Button
                onClick={handleAccept}
                disabled={isAccepting}
                className="w-full"
              >
                {isAccepting ? "Joining..." : "Accept Invitation"}{" "}
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
