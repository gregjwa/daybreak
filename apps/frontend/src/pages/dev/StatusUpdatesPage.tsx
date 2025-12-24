/**
 * Status Updates Test Page
 * 
 * This page will allow testing automated status transitions:
 * 
 * 1. Select a supplier and project
 * 2. Simulate events that trigger status changes:
 *    - Email received with quote → "Quoted"
 *    - User confirms vendor → "Confirmed"
 *    - Contract signed → "Contracted"
 *    - Payment received → "Paid"
 * 3. Preview what the status would change to
 * 4. Test the AI status detection logic
 * 
 * Future implementation will include:
 * - Project/Supplier picker
 * - Event simulator (mock emails, actions)
 * - Status transition preview
 * - AI confidence scores for detected status changes
 */

import { ArrowsClockwise, HardHat } from "@phosphor-icons/react";

export default function StatusUpdatesPage() {
  return (
    <div className="flex flex-col h-full">
      <header className="px-6 py-4 border-b bg-background">
        <div className="flex items-center gap-3">
          <ArrowsClockwise className="h-6 w-6 text-primary" weight="duotone" />
          <div>
            <h1 className="text-xl font-semibold">Status Updates Test</h1>
            <p className="text-sm text-muted-foreground">
              Test automated supplier status transitions
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
            This test page is coming soon. It will allow you to:
          </p>
          <ul className="text-sm text-left mt-4 space-y-2 text-muted-foreground">
            <li className="flex items-start gap-2">
              <span className="text-primary">•</span>
              Simulate events that should trigger status changes
            </li>
            <li className="flex items-start gap-2">
              <span className="text-primary">•</span>
              Preview status transitions before they happen
            </li>
            <li className="flex items-start gap-2">
              <span className="text-primary">•</span>
              Test AI-based status detection from email content
            </li>
            <li className="flex items-start gap-2">
              <span className="text-primary">•</span>
              Debug status update propagation across projects
            </li>
          </ul>
        </div>
      </div>
    </div>
  );
}

