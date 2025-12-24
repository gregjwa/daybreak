/**
 * Data Inspector Page
 * 
 * This page will allow inspecting raw database records:
 * 
 * 1. Browse tables: Users, Suppliers, Projects, Messages, etc.
 * 2. View individual record details
 * 3. See relationships between records
 * 4. Debug data integrity issues
 * 
 * Future implementation will include:
 * - Table browser with pagination
 * - Record detail view with JSON display
 * - Relationship visualization
 * - Quick filters and search
 */

import { Database, HardHat } from "@phosphor-icons/react";

export default function DataInspectorPage() {
  return (
    <div className="flex flex-col h-full">
      <header className="px-6 py-4 border-b bg-background">
        <div className="flex items-center gap-3">
          <Database className="h-6 w-6 text-primary" weight="duotone" />
          <div>
            <h1 className="text-xl font-semibold">Data Inspector</h1>
            <p className="text-sm text-muted-foreground">
              Browse and debug database records
            </p>
          </div>
        </div>
      </header>

      <div className="flex-1 flex items-center justify-center p-8">
        <div className="text-center max-w-md">
          <div className="mb-4 inline-flex items-center justify-center rounded-full bg-amber-100 p-4 dark:bg-amber-900/20">
            <HardHat className="h-8 w-8 text-amber-600" weight="duotone" />
          </div>
          <h2 className="text-lg font-semibold mb-2">Under Construction</h2>
          <p className="text-muted-foreground text-sm">
            This tool is coming soon. It will allow you to:
          </p>
          <ul className="text-sm text-left mt-4 space-y-2 text-muted-foreground">
            <li className="flex items-start gap-2">
              <span className="text-primary">•</span>
              Browse database tables (Suppliers, Projects, Messages)
            </li>
            <li className="flex items-start gap-2">
              <span className="text-primary">•</span>
              View individual record details as JSON
            </li>
            <li className="flex items-start gap-2">
              <span className="text-primary">•</span>
              Explore relationships between records
            </li>
            <li className="flex items-start gap-2">
              <span className="text-primary">•</span>
              Debug data integrity and orphan records
            </li>
          </ul>
        </div>
      </div>
    </div>
  );
}

