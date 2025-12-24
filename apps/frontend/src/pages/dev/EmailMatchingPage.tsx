/**
 * Email Matching Test Page
 * 
 * This page will allow testing the email → supplier matching flow:
 * 
 * 1. Simulate receiving an email (enter from address, subject, body)
 * 2. Call the backend to find matching supplier contact
 * 3. Display the matched supplier and any projects they're linked to
 * 4. Show what status updates would be triggered
 * 
 * Future implementation will include:
 * - Mock email form
 * - Real-time matching preview
 * - Status transition simulation
 * - Project context selection
 */

import { EnvelopeSimple, HardHat } from "@phosphor-icons/react";

export default function EmailMatchingPage() {
  return (
    <div className="flex flex-col h-full">
      <header className="px-6 py-4 border-b bg-background">
        <div className="flex items-center gap-3">
          <EnvelopeSimple className="h-6 w-6 text-primary" weight="duotone" />
          <div>
            <h1 className="text-xl font-semibold">Email Matching Test</h1>
            <p className="text-sm text-muted-foreground">
              Simulate incoming emails to test supplier matching
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
              Simulate receiving an email from an address
            </li>
            <li className="flex items-start gap-2">
              <span className="text-primary">•</span>
              See which supplier contact would be matched
            </li>
            <li className="flex items-start gap-2">
              <span className="text-primary">•</span>
              Preview status updates across active projects
            </li>
            <li className="flex items-start gap-2">
              <span className="text-primary">•</span>
              Test edge cases like unknown senders
            </li>
          </ul>
        </div>
      </div>
    </div>
  );
}

