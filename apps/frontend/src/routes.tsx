import React from 'react'
import { createBrowserRouter, Outlet } from "react-router-dom"
import RootLayout from "./components/RootLayout"
import App from "./App"

// Lazy load pages for performance
const OrganizationsPage = React.lazy(() => import("@/pages/organizations/OrganizationsPage"))
const OrganizationDetailPage = React.lazy(() => import("@/pages/organizations/OrganizationDetailPage"))
const InviteLandingPage = React.lazy(() => import("@/pages/invite-landing/InviteLandingPage"))

const LoadingFallback = () => <div className="p-6 text-center text-muted-foreground">Loading...</div>

export const router = createBrowserRouter([
  {
    path: "/",
    element: <RootLayout />,
    children: [
      {
        index: true,
        element: <App />, // Existing Calendar Dashboard as home
      },
      {
        path: "organizations",
        children: [
          {
            index: true,
            element: (
              <React.Suspense fallback={<LoadingFallback />}>
                <OrganizationsPage />
              </React.Suspense>
            ),
          },
          {
             path: ":id",
             element: (
              <React.Suspense fallback={<LoadingFallback />}>
                <OrganizationDetailPage />
              </React.Suspense>
             )
          }
        ]
      },
    ],
  },
  {
    path: "/invite/:token",
    element: (
      <React.Suspense fallback={<LoadingFallback />}>
        <InviteLandingPage />
      </React.Suspense>
    ),
  }
]);
