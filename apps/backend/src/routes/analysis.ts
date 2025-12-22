import { Hono } from "hono";
import { getAuth } from "@hono/clerk-auth";
import { google } from "googleapis";
import { prisma } from "../lib/prisma";
import { 
  fetchRecentEmails, 
  clusterEmailsIntoProjects, 
  inferWorkflowFromProjects, 
  extractEntitiesFromEmail 
} from "../lib/analysis-service";
import { extractEmailBody } from "../lib/email-analysis";

const analysisRouter = new Hono();

analysisRouter.post("/backfill", async (c) => {
  const auth = getAuth(c);
  if (!auth?.userId) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const clerkClient = c.get("clerk");
  const tokenResponse = await clerkClient.users.getUserOauthAccessToken(
    auth.userId,
    "oauth_google"
  );

  if (!tokenResponse.data || tokenResponse.data.length === 0) {
    return c.json({ error: "No Token" }, 403);
  }

  const accessToken = tokenResponse.data[0].token;
  const oauth2Client = new google.auth.OAuth2();
  oauth2Client.setCredentials({ access_token: accessToken });

  // 1. Fetch Emails
  console.log("Step 1: Fetching emails...");
  const emails = await fetchRecentEmails(oauth2Client, 60); // Last 60 days
  console.log(`Fetched ${emails.length} emails.`);

  // 2. Cluster into Projects
  console.log("Step 2: Clustering...");
  const clusters = await clusterEmailsIntoProjects(emails);
  console.log(`Identified ${clusters.length} potential projects.`);

  // 3. Infer Workflow (using top 5 largest clusters for better signal)
  console.log("Step 3: Inferring Workflow...");
  const topClusters = clusters
    .sort((a, b) => b.emails.length - a.emails.length)
    .slice(0, 5);

  // Hydrate clusters for AI analysis (extract body text)
  const hydratedClusters = topClusters.map(c => ({
    name: c.name,
    history: c.emails.map((e: any) => {
      const headers = e.payload?.headers || [];
      return {
        subject: headers.find((h: any) => h.name === 'Subject')?.value,
        date: headers.find((h: any) => h.name === 'Date')?.value,
        from: headers.find((h: any) => h.name === 'From')?.value,
        body: extractEmailBody(e.payload).substring(0, 200) // limit body size
      };
    })
  }));

  // Call AI to define workflow
  let workflowDefinition;
  try {
    workflowDefinition = await inferWorkflowFromProjects(hydratedClusters);
  } catch (error) {
    console.error("AI Inference failed:", error);
    return c.json({ error: "Failed to infer workflow from data" }, 500);
  }

  // 4. Save to Database
  console.log("Step 4: Saving to DB...");
  const user = await prisma.user.findUnique({ 
    where: { clerkId: auth.userId },
    include: { business: true }
  });

  if (!user?.business) {
    return c.json({ error: "No business found for user" }, 404);
  }

  const savedWorkflow = await prisma.workflow.create({
    data: {
      businessId: user.business.id,
      name: workflowDefinition.name,
      description: workflowDefinition.description,
      stages: {
        create: workflowDefinition.stages.map((s: any) => ({
          name: s.name,
          description: s.description,
          order: s.order
        }))
      }
    },
    include: { stages: true }
  });

  // 5. Create Project instances for the clusters
  // (Only creating the top ones we analyzed for now)
  for (const cluster of topClusters) {
    // Determine current stage for this project (simplified: assuming last stage for historical ones)
    // In reality, we'd ask AI "Which stage is this project currently in?"
    const defaultStage = savedWorkflow.stages[0]; 

    await prisma.project.create({
      data: {
        businessId: user.business.id,
        workflowId: savedWorkflow.id,
        name: cluster.name,
        currentStageId: defaultStage.id,
        threadId: cluster.emails[0].threadId // Link to main thread
      }
    });
  }

  return c.json({
    success: true,
    workflow: savedWorkflow,
    projectsCreated: topClusters.length
  });
});

export default analysisRouter;

