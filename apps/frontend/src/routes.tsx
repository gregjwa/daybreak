import { lazy, Suspense } from "react";
import { createBrowserRouter, Outlet, RouterProvider } from "react-router-dom";
// We'll assume a RootLayout exists or we define a simple one here for now.
import RootLayout from "@/components/RootLayout"; 
import InviteLandingPage from "@/pages/invite-landing/InviteLandingPage";
import OrganizationsPage from "@/pages/organizations/OrganizationsPage";
import OrganizationDetailPage from "@/pages/organizations/OrganizationDetailPage";
import ProjectVendors from "@/pages/projects/ProjectVendors";
import ProjectList from "@/pages/projects/ProjectList";

// Lazy load supplier pages
const SuppliersPage = lazy(() => import("@/pages/suppliers/SuppliersPage"));
const SupplierDetailPage = lazy(() => import("@/pages/suppliers/SupplierDetailPage"));

// Loading fallback
const PageLoader = () => (
  <div className="flex h-full items-center justify-center">
    <div className="text-muted-foreground">Loading...</div>
  </div>
);

// Placeholder for Project Overview
const ProjectOverview = () => <div className="p-8">Project Overview (Coming Soon)</div>;

// Layout for Project Section (Sidebar context etc)
const ProjectLayout = () => {
    return (
        <div className="flex flex-col h-full w-full">
             {/* We could put a secondary nav here if needed, or just rely on global sidebar */}
             <Outlet />
        </div>
    )
}

export const router = createBrowserRouter([
  {
    path: "/",
    element: <RootLayout />,
    children: [
      {
        path: "/",
        element: <div>Dashboard Home</div>,
      },
      {
        path: "organizations",
        element: <OrganizationsPage />,
      },
      {
        path: "organizations/:orgId",
        element: <OrganizationDetailPage />,
      },
      {
        path: "projects",
        element: <ProjectList />,
      },
      {
        path: "projects/:projectId",
        element: <ProjectLayout />,
        children: [
            {
                path: "", // Default to overview
                element: <ProjectOverview />
            },
            {
                path: "vendors",
                element: <ProjectVendors />
            }
        ]
      },
      {
        path: "suppliers",
        element: (
          <Suspense fallback={<PageLoader />}>
            <SuppliersPage />
          </Suspense>
        ),
      },
      {
        path: "suppliers/:supplierId",
        element: (
          <Suspense fallback={<PageLoader />}>
            <SupplierDetailPage />
          </Suspense>
        ),
      },
    ],
  },
  {
    path: "/invite/:token",
    element: <InviteLandingPage />,
  },
]);

export function AppRoutes() {
  return <RouterProvider router={router} />;
}
