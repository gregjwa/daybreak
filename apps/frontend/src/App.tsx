import { RouterProvider, createBrowserRouter } from "react-router-dom";
import { SignedIn, SignedOut, RedirectToSignIn } from "@clerk/clerk-react";
import { DashboardPage } from "@/pages/dashboard";
import { InviteAcceptPage } from "@/pages/invite";
import { WelcomePage } from "@/pages/welcome";

const router = createBrowserRouter([
  {
    path: "/",
    element: (
      <>
        <SignedIn>
          <DashboardPage />
        </SignedIn>
        <SignedOut>
          <RedirectToSignIn />
        </SignedOut>
      </>
    ),
  },
  {
    path: "/invite/:code",
    element: <InviteAcceptPage />,
  },
  {
    path: "/welcome",
    element: (
      <>
        <SignedIn>
          <WelcomePage />
        </SignedIn>
        <SignedOut>
          <RedirectToSignIn />
        </SignedOut>
      </>
    ),
  },
]);

function App() {
  return <RouterProvider router={router} />;
}

export default App;
