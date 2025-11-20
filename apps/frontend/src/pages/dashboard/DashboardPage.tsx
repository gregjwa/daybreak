import { useProfile } from "@/api/useProfile";
import { useEvents } from "@/hooks/useEvents";
import { useGmailWatch } from "@/hooks/useGmailWatch";
import { BusinessSetupForm, CreateInviteDialog } from "./components";
import { Button } from "@/ui/button";
import { Card } from "@/ui/card";
import { UserButton } from "@clerk/clerk-react";

const DashboardPage = () => {
  const { data: profile, isLoading: profileLoading } = useProfile();
  const { data: events, isLoading: eventsLoading, error: eventsError } = useEvents();

  // Automatically set up Gmail watch when user signs in
  useGmailWatch();

  if (profileLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p>Loading...</p>
      </div>
    );
  }

  // If user doesn't have a Business profile yet, show setup form
  if (!profile?.business && profile?.accountType !== "PERSON") {
    return (
      <div className="min-h-screen p-4">
        <header className="flex justify-end mb-4">
          <UserButton />
        </header>
        <BusinessSetupForm />
      </div>
    );
  }

  const isBusiness = profile?.accountType === "BUSINESS";

  return (
    <div className="min-h-screen p-4">
      <header className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-3xl font-bold">
            {profile?.business?.name || profile?.person?.name || "Dashboard"}
          </h1>
          <p className="text-muted-foreground">
            {isBusiness ? "Business Account" : "Team Member"}
          </p>
        </div>
        <div className="flex items-center gap-4">
          {isBusiness && (
            <CreateInviteDialog>
              <Button>Create Invite</Button>
            </CreateInviteDialog>
          )}
          <UserButton />
        </div>
      </header>

      <div className="max-w-4xl mx-auto">
        <h2 className="text-2xl font-semibold mb-4">Calendar Events (Past Month)</h2>

        {eventsLoading && <p>Loading calendar events...</p>}

        {eventsError && (
          <Card className="p-4 border-destructive">
            <p className="text-destructive mb-2">Error: {eventsError.message}</p>
            <p className="text-sm text-muted-foreground">
              Make sure you've connected your Google account and granted calendar
              access.
            </p>
          </Card>
        )}

        {events && events.length === 0 && (
          <p className="text-muted-foreground">
            No calendar events found in the past month.
          </p>
        )}

        {events && events.length > 0 && (
          <div className="grid gap-4">
            {events.map((event) => (
              <Card key={event.id} className="p-4">
                <h3 className="text-lg font-semibold mb-2 text-primary">
                  {event.name}
                </h3>
                <p className="text-sm text-muted-foreground mb-1">
                  📅 {new Date(event.date).toLocaleString()}
                </p>
                {event.location && (
                  <p className="text-sm text-muted-foreground mb-1">
                    📍 {event.location}
                  </p>
                )}
                {event.description && (
                  <p className="text-sm text-muted-foreground mt-2">
                    {event.description}
                  </p>
                )}
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default DashboardPage;

