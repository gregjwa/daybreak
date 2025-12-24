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

// Lazy load inbox pages
const InboxSettingsPage = lazy(() => import("@/pages/inbox/InboxSettingsPage"));
const InboxImportPage = lazy(() => import("@/pages/inbox/InboxImportPage"));
const PendingActionsPage = lazy(() => import("@/pages/inbox/PendingActionsPage"));

// Lazy load settings pages
const StatusConfigPage = lazy(() => import("@/pages/settings/StatusConfigPage"));

// Lazy load project pages
const ImportProjectPage = lazy(() => import("@/pages/projects/ImportProjectPage"));

// Lazy load dev pages
const DevLayout = lazy(() => import("@/pages/dev/DevLayout"));
const DevIndexPage = lazy(() => import("@/pages/dev/DevIndexPage"));
const ExperimentsPage = lazy(() => import("@/pages/dev/ExperimentsPage"));
const EmailMatchingPage = lazy(() => import("@/pages/dev/EmailMatchingPage"));
const StatusUpdatesPage = lazy(() => import("@/pages/dev/StatusUpdatesPage"));
const DataInspectorPage = lazy(() => import("@/pages/dev/DataInspectorPage"));

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
      {
        path: "inbox",
        element: (
          <Suspense fallback={<PageLoader />}>
            <InboxSettingsPage />
          </Suspense>
        ),
      },
      {
        path: "inbox/import",
        element: (
          <Suspense fallback={<PageLoader />}>
            <InboxImportPage />
          </Suspense>
        ),
      },
      {
        path: "inbox/pending",
        element: (
          <Suspense fallback={<PageLoader />}>
            <PendingActionsPage />
          </Suspense>
        ),
      },
      {
        path: "settings/statuses",
        element: (
          <Suspense fallback={<PageLoader />}>
            <StatusConfigPage />
          </Suspense>
        ),
      },
      {
        path: "projects/import",
        element: (
          <Suspense fallback={<PageLoader />}>
            <ImportProjectPage />
          </Suspense>
        ),
      },
    ],
  },
  {
    path: "/invite/:token",
    element: <InviteLandingPage />,
  },
  {
    path: "/dev",
    element: (
      <Suspense fallback={<PageLoader />}>
        <DevLayout />
      </Suspense>
    ),
    children: [
      {
        path: "",
        element: (
          <Suspense fallback={<PageLoader />}>
            <DevIndexPage />
          </Suspense>
        ),
      },
      {
        path: "experiments",
        element: (
          <Suspense fallback={<PageLoader />}>
            <ExperimentsPage />
          </Suspense>
        ),
      },
      {
        path: "email-matching",
        element: (
          <Suspense fallback={<PageLoader />}>
            <EmailMatchingPage />
          </Suspense>
        ),
      },
      {
        path: "status-updates",
        element: (
          <Suspense fallback={<PageLoader />}>
            <StatusUpdatesPage />
          </Suspense>
        ),
      },
      {
        path: "data",
        element: (
          <Suspense fallback={<PageLoader />}>
            <DataInspectorPage />
          </Suspense>
        ),
      },
    ],
  },
]);

export function AppRoutes() {
  return <RouterProvider router={router} />;
}
