/**
 * Testing API Hooks
 * 
 * React Query hooks for the status detection testing system.
 */

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getApiBaseUrl } from "@/lib/apiBase";

const API_URL = getApiBaseUrl();

// --- Types ---

export interface TestPersona {
  id: string;
  name: string;
  companyName: string;
  contactName: string;
  email: string;
  category: string;
  communicationStyle: string;
  reliability: string;
  pricePoint: string;
  createdAt: string;
  _count?: { testCases: number };
}

export interface TestEmailSet {
  id: string;
  name: string;
  description: string | null;
  totalCases: number;
  inboundCount: number;
  outboundCount: number;
  createdAt: string;
  _count?: { cases: number; runs: number };
}

export interface TestCase {
  id: string;
  emailSetId: string;
  personaId: string;
  subject: string;
  body: string;
  direction: "INBOUND" | "OUTBOUND";
  threadContext: { direction: string; subject: string; body: string }[] | null;
  hasThreadContext: boolean;
  expectedStatus: string;
  scenario: string;
  difficulty: number;
  tags: string[];
  generationNotes: string | null;
  createdAt: string;
  persona?: { name: string; category: string };
}

export interface TestPrompt {
  id: string;
  version: string;
  name: string;
  description: string | null;
  systemPrompt: string;
  model: string;
  maxTokens: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  runCount?: number;
  avgAccuracy?: number | null;
  runs?: TestRunSummary[];
}

export interface TestRunSummary {
  id: string;
  accuracy: number;
  status: string;
  createdAt: string;
  emailSet?: { name: string };
}

export interface TestRun {
  id: string;
  emailSetId: string;
  promptId: string;
  promptVersion: string;
  model: string;
  promptSnapshot: string;
  totalCases: number;
  passed: number;
  failed: number;
  accuracy: number;
  avgLatencyMs: number;
  totalTokens: number;
  estimatedCost: number;
  status: string;
  startedAt: string | null;
  completedAt: string | null;
  errorMessage: string | null;
  createdAt: string;
  emailSet?: { name: string };
  prompt?: { version: string; name: string };
}

export interface TestResult {
  id: string;
  runId: string;
  caseId: string;
  passed: boolean;
  expectedStatus: string;
  detectedStatus: string | null;
  confidence: number | null;
  reasoning: string | null;
  rawResponse: string | null;
  latencyMs: number;
  tokens: number | null;
  createdAt: string;
  case?: TestCase & { persona: TestPersona };
}

export interface TestRunDetail {
  run: TestRun & {
    results: TestResult[];
  };
  breakdowns: {
    byDifficulty: Record<string, { passed: number; total: number }>;
    byStatus: Record<string, { passed: number; total: number }>;
    byScenario: Record<string, { passed: number; total: number }>;
  };
  failures: TestResult[];
}

// --- Personas ---

export function usePersonas() {
  return useQuery({
    queryKey: ["testing", "personas"],
    queryFn: async (): Promise<TestPersona[]> => {
      const res = await fetch(`${API_URL}/testing/personas`);
      if (!res.ok) throw new Error("Failed to fetch personas");
      return res.json();
    },
  });
}

export function usePersona(id: string | undefined) {
  return useQuery({
    queryKey: ["testing", "personas", id],
    queryFn: async () => {
      if (!id) throw new Error("No persona ID");
      const res = await fetch(`${API_URL}/testing/personas/${id}`);
      if (!res.ok) throw new Error("Failed to fetch persona");
      return res.json();
    },
    enabled: !!id,
  });
}

export function useGeneratePersonas() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const res = await fetch(`${API_URL}/testing/personas/generate`, {
        method: "POST",
      });
      if (!res.ok) throw new Error("Failed to generate personas");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["testing", "personas"] });
    },
  });
}

// --- Email Sets ---

export function useEmailSets() {
  return useQuery({
    queryKey: ["testing", "email-sets"],
    queryFn: async (): Promise<TestEmailSet[]> => {
      const res = await fetch(`${API_URL}/testing/email-sets`);
      if (!res.ok) throw new Error("Failed to fetch email sets");
      return res.json();
    },
  });
}

export function useEmailSet(id: string | undefined, options?: { page?: number; pageSize?: number; direction?: string; difficulty?: string; status?: string }) {
  const params = new URLSearchParams();
  if (options?.page) params.set("page", String(options.page));
  if (options?.pageSize) params.set("pageSize", String(options.pageSize));
  if (options?.direction) params.set("direction", options.direction);
  if (options?.difficulty) params.set("difficulty", options.difficulty);
  if (options?.status) params.set("status", options.status);

  return useQuery({
    queryKey: ["testing", "email-sets", id, options],
    queryFn: async () => {
      if (!id) throw new Error("No email set ID");
      const res = await fetch(`${API_URL}/testing/email-sets/${id}?${params}`);
      if (!res.ok) throw new Error("Failed to fetch email set");
      return res.json() as Promise<{
        emailSet: TestEmailSet;
        cases: TestCase[];
        pagination: { page: number; pageSize: number; total: number; totalPages: number };
      }>;
    },
    enabled: !!id,
  });
}

export function useCreateEmailSet() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: { name: string; description?: string }) => {
      const res = await fetch(`${API_URL}/testing/email-sets`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error("Failed to create email set");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["testing", "email-sets"] });
    },
  });
}

export function useGenerateEmails() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (params: { id: string; count?: number; useAI?: boolean }) => {
      const res = await fetch(`${API_URL}/testing/email-sets/${params.id}/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ count: params.count, useAI: params.useAI }),
      });
      if (!res.ok) throw new Error("Failed to generate emails");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["testing", "email-sets"] });
    },
  });
}

// --- Test Cases ---

export function useTestCase(id: string | undefined) {
  return useQuery({
    queryKey: ["testing", "cases", id],
    queryFn: async () => {
      if (!id) throw new Error("No case ID");
      const res = await fetch(`${API_URL}/testing/cases/${id}`);
      if (!res.ok) throw new Error("Failed to fetch test case");
      return res.json();
    },
    enabled: !!id,
  });
}

// --- Prompts ---

export function usePrompts() {
  return useQuery({
    queryKey: ["testing", "prompts"],
    queryFn: async (): Promise<TestPrompt[]> => {
      const res = await fetch(`${API_URL}/testing/prompts`);
      if (!res.ok) throw new Error("Failed to fetch prompts");
      return res.json();
    },
  });
}

export function usePrompt(id: string | undefined) {
  return useQuery({
    queryKey: ["testing", "prompts", id],
    queryFn: async () => {
      if (!id) throw new Error("No prompt ID");
      const res = await fetch(`${API_URL}/testing/prompts/${id}`);
      if (!res.ok) throw new Error("Failed to fetch prompt");
      return res.json();
    },
    enabled: !!id,
  });
}

export function useCreatePrompt() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: {
      version: string;
      name: string;
      description?: string;
      systemPrompt: string;
      model?: string;
      maxTokens?: number;
    }) => {
      const res = await fetch(`${API_URL}/testing/prompts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to create prompt");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["testing", "prompts"] });
    },
  });
}

export function useUpdatePrompt() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (params: {
      id: string;
      data: Partial<{
        name: string;
        description: string;
        systemPrompt: string;
        model: string;
        maxTokens: number;
        isActive: boolean;
      }>;
    }) => {
      const res = await fetch(`${API_URL}/testing/prompts/${params.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(params.data),
      });
      if (!res.ok) throw new Error("Failed to update prompt");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["testing", "prompts"] });
    },
  });
}

// --- Runs ---

export function useRuns() {
  return useQuery({
    queryKey: ["testing", "runs"],
    queryFn: async (): Promise<TestRun[]> => {
      const res = await fetch(`${API_URL}/testing/runs`);
      if (!res.ok) throw new Error("Failed to fetch runs");
      return res.json();
    },
  });
}

export function useRun(id: string | undefined) {
  return useQuery({
    queryKey: ["testing", "runs", id],
    queryFn: async (): Promise<TestRunDetail> => {
      if (!id) throw new Error("No run ID");
      const res = await fetch(`${API_URL}/testing/runs/${id}`);
      if (!res.ok) throw new Error("Failed to fetch run");
      return res.json();
    },
    enabled: !!id,
  });
}

export function useRunFailures(id: string | undefined) {
  return useQuery({
    queryKey: ["testing", "runs", id, "failures"],
    queryFn: async (): Promise<TestResult[]> => {
      if (!id) throw new Error("No run ID");
      const res = await fetch(`${API_URL}/testing/runs/${id}/failures`);
      if (!res.ok) throw new Error("Failed to fetch failures");
      return res.json();
    },
    enabled: !!id,
  });
}

export function useStartRun() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (params: { emailSetId: string; promptId: string; modelOverride?: string }) => {
      const res = await fetch(`${API_URL}/testing/runs`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(params),
      });
      if (!res.ok) throw new Error("Failed to start run");
      return res.json() as Promise<{ runId: string; status: string }>;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["testing", "runs"] });
    },
  });
}

export function useCompareRuns(run1?: string, run2?: string) {
  return useQuery({
    queryKey: ["testing", "compare", run1, run2],
    queryFn: async () => {
      if (!run1 || !run2) throw new Error("Two run IDs required");
      const res = await fetch(`${API_URL}/testing/compare?run1=${run1}&run2=${run2}`);
      if (!res.ok) throw new Error("Failed to compare runs");
      return res.json();
    },
    enabled: !!run1 && !!run2,
  });
}


