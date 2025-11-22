import { SignedIn, SignedOut } from "@clerk/clerk-react";
import { useEvents } from "@/hooks/useEvents";
import { useGmailWatch } from "@/hooks/useGmailWatch";
import { Card, CardContent, CardHeader, CardTitle } from "@/ui/card";
import { Skeleton } from "@/ui/skeleton";
import { CalendarDays, MapPin } from "lucide-react";

function App() {
  const { data: events, isLoading, error } = useEvents();

  // Automatically set up Gmail watch when user signs in
  useGmailWatch();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Welcome</h1>
        <p className="text-muted-foreground">
          Here is your overview for the past month.
        </p>
      </div>

      <SignedIn>
        <div className="space-y-4">
          <h2 className="text-xl font-semibold tracking-tight">
            Calendar Events (Past Month)
          </h2>

          {isLoading && (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {[1, 2, 3].map((i) => (
                <Card key={i}>
                  <CardHeader>
                    <Skeleton className="h-6 w-2/3" />
                  </CardHeader>
                  <CardContent className="space-y-2">
                    <Skeleton className="h-4 w-1/2" />
                    <Skeleton className="h-16 w-full" />
                  </CardContent>
                </Card>
              ))}
            </div>
          )}

          {error && (
            <div className="rounded-md border border-destructive/50 bg-destructive/10 p-4 text-destructive">
              <p className="font-medium">Error: {error.message}</p>
              <p className="mt-1 text-sm opacity-90">
                Make sure you've connected your Google account in your user
                settings and granted calendar access.
              </p>
            </div>
          )}

          {!isLoading && events && events.length === 0 && (
            <p className="text-muted-foreground">
              No calendar events found in the past month.
            </p>
          )}

          {!isLoading && events && events.length > 0 && (
            <div className="grid gap-3 grid-cols-2 md:grid-cols-4 lg:grid-cols-5">
              {events.map((event: any) => (
                <Card
                  key={event.id}
                  className="py-3 px-3 gap-1.5 bg-secondary/20 hover:bg-secondary/40 border border-border/50 shadow-sm hover:shadow-md transition-all"
                >
                  <CardHeader className="p-0 gap-0">
                    <CardTitle
                      className="text-sm font-bold leading-tight truncate text-foreground/90"
                      title={event.name}
                    >
                      {event.name}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="p-0 space-y-1.5 text-xs">
                    <div className="flex items-center font-bold text-primary/90 mt-0.5">
                      <CalendarDays className="mr-1.5 h-3.5 w-3.5 flex-shrink-0" />
                      <span className="truncate">
                        {new Date(event.date).toLocaleDateString(undefined, {
                          month: "short",
                          day: "numeric",
                          hour: "numeric",
                          minute: "2-digit",
                        })}
                      </span>
                    </div>
                    {event.location && (
                      <div
                        className="flex items-center text-muted-foreground truncate"
                        title={event.location}
                      >
                        <MapPin className="mr-1.5 h-3 w-3 opacity-70 flex-shrink-0" />
                        <span className="truncate font-medium">
                          {event.location}
                        </span>
                      </div>
                    )}
                    {event.description && (
                      <div className="mt-1.5 text-[10px] leading-tight text-muted-foreground/80 line-clamp-2 font-medium">
                        {event.description}
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      </SignedIn>

      <SignedOut>
        <div className="rounded-lg border border-dashed p-8 text-center">
          <p className="text-muted-foreground">
            Please sign in to view events.
          </p>
        </div>
      </SignedOut>
    </div>
  );
}

export default App;
