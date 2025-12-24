import { Link } from "react-router-dom";
import {
  Flask,
  EnvelopeSimple,
  ArrowsClockwise,
  Database,
  ArrowRight,
} from "@phosphor-icons/react";
import { cn } from "@/lib/utils";

const devTools = [
  {
    name: "Enrichment Experiments",
    description:
      "A/B test different AI models and prompts for supplier classification. View accuracy rates, latency, costs, and provide feedback on individual runs.",
    path: "/dev/experiments",
    icon: Flask,
    status: "active" as const,
  },
  {
    name: "Email Matching",
    description:
      "Test the incoming email → supplier matching flow. Simulate receiving an email and verify it matches the correct supplier contact.",
    path: "/dev/email-matching",
    icon: EnvelopeSimple,
    status: "placeholder" as const,
  },
  {
    name: "Status Updates",
    description:
      "Test automated status transitions. Simulate events that should trigger supplier status changes across active projects.",
    path: "/dev/status-updates",
    icon: ArrowsClockwise,
    status: "placeholder" as const,
  },
  {
    name: "Data Inspector",
    description:
      "View and query raw database records. Useful for debugging data integrity issues and understanding the data model.",
    path: "/dev/data",
    icon: Database,
    status: "placeholder" as const,
  },
];

export default function DevIndexPage() {
  return (
    <div className="flex flex-col h-full overflow-y-auto">
      <header className="px-8 py-8 border-b bg-gradient-to-br from-amber-50 to-orange-50 dark:from-amber-950/20 dark:to-orange-950/20">
        <h1 className="font-display text-3xl font-bold mb-2">Dev Tools</h1>
        <p className="text-muted-foreground max-w-2xl">
          Test and debug system flows, compare AI models, and inspect data.
          These tools are for development and QA purposes.
        </p>
      </header>

      <main className="flex-1 p-8">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-4xl">
          {devTools.map((tool) => {
            const isClickable = tool.status === "active" || tool.status === "placeholder";

            return (
              <Link
                key={tool.path}
                to={tool.path}
                className={cn(
                  "group block rounded-xl border p-6 transition-all",
                  "hover:border-primary hover:shadow-md cursor-pointer"
                )}
              >
                <div className="flex items-start gap-4">
                  <div
                    className={cn(
                      "p-3 rounded-lg",
                      tool.status === "active"
                        ? "bg-primary/10 text-primary"
                        : "bg-amber-100 text-amber-600 dark:bg-amber-900/20"
                    )}
                  >
                    <tool.icon className="h-6 w-6" weight="duotone" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="font-semibold">{tool.name}</h3>
                      {tool.status === "placeholder" && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 dark:bg-amber-900/20 dark:text-amber-400">
                          In progress
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {tool.description}
                    </p>
                  </div>
                  {isClickable && (
                    <ArrowRight className="h-5 w-5 text-muted-foreground group-hover:text-primary group-hover:translate-x-1 transition-all" />
                  )}
                </div>
              </Link>
            );
          })}
        </div>
      </main>
    </div>
  );
}

