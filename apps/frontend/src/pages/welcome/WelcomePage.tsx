import { useProfile } from "@/api/useProfile";
import { Card } from "@/ui/card";
import { Badge } from "@/ui/badge";
import { Button } from "@/ui/button";
import { useNavigate } from "react-router-dom";

const WelcomePage = () => {
  const { data: profile, isLoading } = useProfile();
  const navigate = useNavigate();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Card className="p-6">
          <p>Loading...</p>
        </Card>
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Card className="p-6">
          <p>Profile not found</p>
        </Card>
      </div>
    );
  }

  const isPerson = profile.accountType === "PERSON";

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <Card className="p-8 max-w-lg w-full">
        <div className="text-center mb-6">
          <h1 className="text-3xl font-bold mb-2">Welcome!</h1>
          <p className="text-muted-foreground">
            Your account has been set up successfully.
          </p>
        </div>

        <div className="space-y-4 mb-6">
          {isPerson && profile.person && (
            <>
              <div>
                <h3 className="text-sm font-medium text-muted-foreground mb-1">
                  Your Name
                </h3>
                <p className="text-lg font-semibold">{profile.person.name}</p>
              </div>

              <div>
                <h3 className="text-sm font-medium text-muted-foreground mb-1">
                  Your Roles
                </h3>
                <div className="flex flex-wrap gap-2">
                  {profile.person.roles.map((role) => (
                    <Badge key={role} variant="secondary">
                      {role}
                    </Badge>
                  ))}
                </div>
              </div>

              {profile.person.businesses.length > 0 && (
                <div>
                  <h3 className="text-sm font-medium text-muted-foreground mb-1">
                    Linked to Business
                  </h3>
                  {profile.person.businesses.map((link) => (
                    <p key={link.business.id} className="text-lg font-semibold">
                      {link.business.name}
                    </p>
                  ))}
                </div>
              )}
            </>
          )}

          {!isPerson && profile.business && (
            <div>
              <h3 className="text-sm font-medium text-muted-foreground mb-1">
                Business Name
              </h3>
              <p className="text-lg font-semibold">{profile.business.name}</p>
            </div>
          )}
        </div>

        <div className="bg-muted p-4 rounded-md mb-6">
          <p className="text-sm text-muted-foreground">
            {isPerson
              ? "Your calendar has been linked. You'll now appear in scheduling views and can see bookings."
              : "Your business account is ready. You can now invite team members and manage bookings."}
          </p>
        </div>

        <Button onClick={() => navigate("/")} className="w-full">
          Go to Dashboard
        </Button>
      </Card>
    </div>
  );
};

export default WelcomePage;

