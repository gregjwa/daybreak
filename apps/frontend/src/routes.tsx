import { createBrowserRouter, Outlet, RouterProvider } from "react-router-dom";
// We'll assume a RootLayout exists or we define a simple one here for now.
import RootLayout from "@/components/RootLayout"; 
import InviteLandingPage from "@/pages/invite-landing/InviteLandingPage";
import OrganizationsPage from "@/pages/organizations/OrganizationsPage";
import OrganizationDetailPage from "@/pages/organizations/OrganizationDetailPage";
import ProjectVendors from "@/pages/projects/ProjectVendors";
import ProjectList from "@/pages/projects/ProjectList";

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
      }
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
