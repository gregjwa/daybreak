import {
  SignedIn,
  SignedOut,
  SignInButton,
  SignUpButton,
  UserButton,
} from "@clerk/clerk-react";
import { useEvents } from "@/hooks/useEvents";
import { useGmailWatch } from "@/hooks/useGmailWatch";

function App() {
  const { data: events, isLoading, error } = useEvents();

  // Automatically set up Gmail watch when user signs in
  useGmailWatch();

  return (
    <div>
      <header style={{ marginBottom: "2rem" }}>
        <SignedOut>
          <div style={{ display: "flex", gap: "1rem" }}>
            <SignInButton />
            <SignUpButton />
          </div>
        </SignedOut>
        <SignedIn>
          <UserButton />
        </SignedIn>
      </header>

      <h1>Welcome</h1>

      <SignedIn>
        <h2
          style={{ fontSize: "1.5em", marginTop: "2rem", marginBottom: "1rem" }}
        >
          Calendar Events (Past Month)
        </h2>

        {isLoading && <p>Loading calendar events...</p>}

        {error && (
          <div
            style={{
              padding: "1rem",
              backgroundColor: "#2a1a1a",
              borderRadius: "8px",
              border: "1px solid #ff6b6b",
            }}
          >
            <p style={{ color: "#ff6b6b", marginBottom: "0.5rem" }}>
              Error: {error.message}
            </p>
            <p style={{ color: "#888", fontSize: "0.9em" }}>
              Make sure you've connected your Google account in your user
              settings and granted calendar access.
            </p>
          </div>
        )}

        {events && events.length === 0 && (
          <p style={{ color: "#888" }}>
            No calendar events found in the past month.
          </p>
        )}

        {events && events.length > 0 && (
          <div style={{ display: "grid", gap: "1rem" }}>
            {events.map((event) => (
              <div
                key={event.id}
                style={{
                  padding: "1rem",
                  backgroundColor: "#1a1a1a",
                  borderRadius: "8px",
                  border: "1px solid #3a3a3a",
                }}
              >
                <h3 style={{ marginBottom: "0.5rem", color: "#646cff" }}>
                  {event.name}
                </h3>
                <p style={{ color: "#888", margin: "0.25rem 0" }}>
                  📅 {new Date(event.date).toLocaleString()}
                </p>
                {event.location && (
                  <p style={{ color: "#888", margin: "0.25rem 0" }}>
                    📍 {event.location}
                  </p>
                )}
                {event.description && (
                  <p
                    style={{
                      color: "#999",
                      margin: "0.5rem 0 0 0",
                      fontSize: "0.9em",
                    }}
                  >
                    {event.description}
                  </p>
                )}
              </div>
            ))}
          </div>
        )}
      </SignedIn>

      <SignedOut>
        <p style={{ marginTop: "2rem", color: "#888" }}>
          Please sign in to view events.
        </p>
      </SignedOut>
    </div>
  );
}

export default App;
