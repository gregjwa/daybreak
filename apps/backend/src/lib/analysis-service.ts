import { google } from 'googleapis';
import { generateText, generateObject } from 'ai';
import { openai } from '@ai-sdk/openai';
import { z } from 'zod';
import { prisma } from './prisma';

// Schema for extracting entities from a single email
const EntityExtractionSchema = z.object({
  projectLikelihood: z.number().describe('Score 0-1 indicating if this email is related to a business project/event'),
  topics: z.array(z.string()).describe('Main subjects (e.g. "Smith Wedding", "Corporate Headshots")'),
  people: z.array(z.string()).describe('Names of people involved'),
  dates: z.array(z.string()).describe('Specific event dates mentioned'),
  eventType: z.string().optional().describe('Type of event if applicable (e.g. Wedding, Conference)'),
});

// Schema for defining a workflow based on project history
const WorkflowDefinitionSchema = z.object({
  name: z.string().describe('Name of the inferred workflow (e.g. "Event Photography")'),
  description: z.string().describe('Description of what this workflow handles'),
  stages: z.array(z.object({
    name: z.string(),
    description: z.string(),
    order: z.number(),
    identifiers: z.array(z.string()).describe('Keywords or actions that identify this stage'),
  })).describe('Sequential stages of the workflow'),
});

/**
 * 1. Fetch History
 * Fetches recent emails to build a dataset for analysis.
 */
export async function fetchRecentEmails(auth: any, daysBack = 90) {
  const gmail = google.gmail({ version: 'v1', auth });
  const now = new Date();
  const past = new Date(now.setDate(now.getDate() - daysBack));
  const q = `after:${Math.floor(past.getTime() / 1000)}`;

  let messages: any[] = [];
  let nextPageToken: string | undefined = undefined;

  // Fetch up to 200 emails for analysis
  do {
    const res = await gmail.users.messages.list({
      userId: 'me',
      q,
      maxResults: 100,
      pageToken: nextPageToken,
    });
    
    if (res.data.messages) {
      messages = [...messages, ...res.data.messages];
    }
    nextPageToken = res.data.nextPageToken || undefined;
  } while (nextPageToken && messages.length < 200);

  // Hydrate messages
  const fullMessages = await Promise.all(messages.map(async (msg) => {
    const res = await gmail.users.messages.get({
      userId: 'me',
      id: msg.id,
      format: 'full',
    });
    return res.data;
  }));

  return fullMessages;
}

/**
 * 2. Entity Extraction
 * Analyzes each email to pull out project indicators.
 */
export async function extractEntitiesFromEmail(subject: string, body: string) {
  try {
    const { object } = await generateObject({
      model: openai('gpt-4-turbo'), // High intelligence needed for extraction
      schema: EntityExtractionSchema,
      prompt: `Analyze this email for project/event planning information.
      
      Subject: ${subject}
      Body: ${body.substring(0, 1000)} // Truncate for token limits
      
      Extract key entities that would help group this into a project.`,
    });
    return object;
  } catch (e) {
    console.error("AI Extraction failed", e);
    return null;
  }
}

/**
 * 3. Clustering (Simplified)
 * Groups threads into likely Projects based on overlapping topics/dates.
 * In a real system, this would use vector embeddings or a graph algorithm.
 */
export async function clusterEmailsIntoProjects(emails: any[]) {
  const projects = new Map<string, {
    name: string;
    emails: any[];
    topics: Set<string>;
    people: Set<string>;
    dates: Set<string>;
  }>();

  console.log(`Clustering ${emails.length} emails...`);

  // Helper to normalize strings
  const normalize = (s: string) => s.toLowerCase().trim();

  for (const email of emails) {
    // Extract entities for this email (mocked for performance if needed, or call extractEntitiesFromEmail)
    // For MVP, we'll assume the extraction is done or we do a lightweight version here
    
    const headers = email.payload?.headers || [];
    const subject = headers.find((h: any) => h.name === 'Subject')?.value || '';
    const threadId = email.threadId;
    
    // Simple clustering strategy:
    // 1. Use threadId as the primary key initially
    // 2. If thread subjects share significant keywords (ignoring "Re:", "Fwd:"), merge them
    
    const cleanSubject = subject.replace(/^(re|fwd):\s*/i, '').trim();
    const existingProjectKey = Array.from(projects.keys()).find(key => {
       // Check if this email's threadId is already in a project
       const project = projects.get(key);
       if (project?.emails.some(e => e.threadId === threadId)) return true;
       
       // Or check fuzzy subject match (very basic)
       if (normalize(project?.name || '') === normalize(cleanSubject)) return true;
       
       return false;
    });

    if (existingProjectKey) {
      const project = projects.get(existingProjectKey)!;
      project.emails.push(email);
      // Merge other metadata if we had it
    } else {
      // Start a new project cluster
      projects.set(cleanSubject, {
        name: cleanSubject,
        emails: [email],
        topics: new Set(),
        people: new Set(),
        dates: new Set()
      });
    }
  }
  
  // Filter out noise (projects with only 1 email, unless it's very recent)
  // Convert Map to Array
  return Array.from(projects.values()).filter(p => p.emails.length > 1);
}

/**
 * 4. Workflow Inference
 * Looks at completed project timelines to define the standard process.
 */
export async function inferWorkflowFromProjects(projects: any[]) {
  // Summarize each project into a timeline string
  const projectSummaries = projects.map(p => `Project: ${p.name}\nHistory: ...`);

  const { object } = await generateObject({
    model: openai('gpt-4-turbo'),
    schema: WorkflowDefinitionSchema,
    prompt: `Here are the timelines of ${projects.length} recent projects.
    
    ${projectSummaries.join('\n\n')}
    
    Identify the common repeatable process (Workflow) they all follow.
    Define distinct Stages (e.g. Inquiry, Planning, Execution).`,
  });

  return object;
}

