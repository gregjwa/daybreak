import { useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@clerk/clerk-react";
import { getApiBaseUrl } from "@/lib/apiBase";
import { Button } from "@/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/ui/card";
import { Textarea } from "@/ui/textarea";
import { Input } from "@/ui/input";
import { Badge } from "@/ui/badge";
import { 
  FileText, 
  Upload, 
  ArrowRight, 
  Check,
  SpinnerGap,
  CalendarBlank,
  MapPin,
  Users,
  CurrencyDollar,
} from "@phosphor-icons/react";
import { cn } from "@/lib/utils";

const API_URL = getApiBaseUrl();

interface SupplierSlot {
  category: string;
  description?: string;
  budget?: number;
  priority: "must-have" | "nice-to-have";
}

interface ExtractedProject {
  name: string;
  eventType: string;
  eventDate?: string;
  venue?: string;
  guestCount?: number;
  totalBudget?: number;
  supplierSlots: SupplierSlot[];
  notes?: string;
}

type Step = "input" | "review" | "confirm";

export default function ImportProjectPage() {
  const navigate = useNavigate();
  const { getToken } = useAuth();
  
  const [step, setStep] = useState<Step>("input");
  const [inputMode, setInputMode] = useState<"text" | "file">("text");
  const [textContent, setTextContent] = useState("");
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [extractedProject, setExtractedProject] = useState<ExtractedProject | null>(null);
  const [error, setError] = useState<string | null>(null);

  const analyzeText = async () => {
    if (!textContent.trim()) return;
    
    setIsAnalyzing(true);
    setError(null);
    
    try {
      const token = await getToken();
      const res = await fetch(`${API_URL}/import/analyze/text`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ text: textContent }),
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        setError(data.error || "Failed to analyze text");
        return;
      }

      setExtractedProject(data.project);
      setStep("review");
    } catch (err) {
      setError("Failed to analyze text");
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleFileDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (!file) return;
    
    setIsAnalyzing(true);
    setError(null);
    
    try {
      const token = await getToken();
      const formData = new FormData();
      formData.append("file", file);

      const res = await fetch(`${API_URL}/import/analyze/file`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
        },
        body: formData,
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        setError(data.error || "Failed to analyze file");
        return;
      }

      setExtractedProject(data.project);
      setStep("review");
    } catch (err) {
      setError("Failed to analyze file");
    } finally {
      setIsAnalyzing(false);
    }
  }, [getToken]);

  const createProject = async () => {
    if (!extractedProject) return;
    
    setIsCreating(true);
    setError(null);
    
    try {
      const token = await getToken();
      const res = await fetch(`${API_URL}/import/create`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(extractedProject),
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        setError(data.error || "Failed to create project");
        return;
      }

      setStep("confirm");
      
      // Navigate to the new project after a moment
      setTimeout(() => {
        navigate(`/projects/${data.project.id}`);
      }, 2000);
    } catch (err) {
      setError("Failed to create project");
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Import Project</h1>
        <p className="text-muted-foreground">
          Create a new project from a document, spreadsheet, or description
        </p>
      </div>

      {/* Progress Steps */}
      <div className="flex items-center gap-2">
        {["input", "review", "confirm"].map((s, i) => (
          <div key={s} className="flex items-center">
            <div
              className={cn(
                "w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium",
                step === s
                  ? "bg-primary text-primary-foreground"
                  : s === "confirm" && step !== "confirm"
                    ? "bg-muted text-muted-foreground"
                    : "bg-primary/20 text-primary"
              )}
            >
              {step === "confirm" && s !== "confirm" ? <Check className="h-4 w-4" /> : i + 1}
            </div>
            {i < 2 && (
              <div className="w-8 h-0.5 bg-muted mx-1" />
            )}
          </div>
        ))}
      </div>

      {error && (
        <div className="p-4 rounded-lg bg-destructive/10 text-destructive text-sm">
          {error}
        </div>
      )}

      {/* Step 1: Input */}
      {step === "input" && (
        <Card>
          <CardHeader>
            <CardTitle>Add Project Information</CardTitle>
            <CardDescription>
              Paste event details, requirements, or upload a budget spreadsheet
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Mode Toggle */}
            <div className="flex gap-2">
              <Button
                variant={inputMode === "text" ? "default" : "outline"}
                onClick={() => setInputMode("text")}
                className="gap-2"
              >
                <FileText className="h-4 w-4" />
                Paste Text
              </Button>
              <Button
                variant={inputMode === "file" ? "default" : "outline"}
                onClick={() => setInputMode("file")}
                className="gap-2"
              >
                <Upload className="h-4 w-4" />
                Upload File
              </Button>
            </div>

            {inputMode === "text" ? (
              <div className="space-y-4">
                <Textarea
                  placeholder="Paste your event description, vendor requirements, budget breakdown, or any planning notes here...

Example:
Johnson Wedding - June 15, 2025
Grand Ballroom Hotel
150 guests
Budget: $45,000

Need:
- Photography ($3,500)
- Florist ($2,000)
- DJ ($1,200)
- Catering (included with venue)"
                  value={textContent}
                  onChange={(e) => setTextContent(e.target.value)}
                  className="min-h-[300px]"
                />
                <Button
                  onClick={analyzeText}
                  disabled={!textContent.trim() || isAnalyzing}
                  className="gap-2"
                >
                  {isAnalyzing ? (
                    <>
                      <SpinnerGap className="h-4 w-4 animate-spin" />
                      Analyzing...
                    </>
                  ) : (
                    <>
                      Analyze
                      <ArrowRight className="h-4 w-4" />
                    </>
                  )}
                </Button>
              </div>
            ) : (
              <div
                onDragOver={(e) => e.preventDefault()}
                onDrop={handleFileDrop}
                className={cn(
                  "border-2 border-dashed rounded-lg p-12 text-center transition-colors",
                  isAnalyzing
                    ? "border-primary bg-primary/5"
                    : "border-muted-foreground/25 hover:border-primary/50"
                )}
              >
                {isAnalyzing ? (
                  <>
                    <SpinnerGap className="h-12 w-12 mx-auto text-primary animate-spin mb-4" />
                    <p className="font-medium">Analyzing document...</p>
                  </>
                ) : (
                  <>
                    <Upload className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                    <p className="font-medium">Drop file here</p>
                    <p className="text-sm text-muted-foreground mt-1">
                      Supports: CSV, TXT, PDF, or images
                    </p>
                  </>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Step 2: Review */}
      {step === "review" && extractedProject && (
        <Card>
          <CardHeader>
            <CardTitle>Review Extracted Information</CardTitle>
            <CardDescription>
              Verify the details before creating your project
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Project Details */}
            <div className="space-y-4">
              <div>
                <label className="text-sm font-medium">Event Name</label>
                <Input
                  value={extractedProject.name}
                  onChange={(e) => setExtractedProject({ ...extractedProject, name: e.target.value })}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium">Event Type</label>
                  <Input
                    value={extractedProject.eventType}
                    onChange={(e) => setExtractedProject({ ...extractedProject, eventType: e.target.value })}
                  />
                </div>
                <div>
                  <label className="text-sm font-medium flex items-center gap-1">
                    <CalendarBlank className="h-4 w-4" /> Date
                  </label>
                  <Input
                    type="date"
                    value={extractedProject.eventDate || ""}
                    onChange={(e) => setExtractedProject({ ...extractedProject, eventDate: e.target.value })}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium flex items-center gap-1">
                    <MapPin className="h-4 w-4" /> Venue
                  </label>
                  <Input
                    value={extractedProject.venue || ""}
                    onChange={(e) => setExtractedProject({ ...extractedProject, venue: e.target.value })}
                    placeholder="Venue name..."
                  />
                </div>
                <div>
                  <label className="text-sm font-medium flex items-center gap-1">
                    <Users className="h-4 w-4" /> Guest Count
                  </label>
                  <Input
                    type="number"
                    value={extractedProject.guestCount || ""}
                    onChange={(e) => setExtractedProject({ ...extractedProject, guestCount: parseInt(e.target.value) || undefined })}
                    placeholder="150"
                  />
                </div>
              </div>

              <div>
                <label className="text-sm font-medium flex items-center gap-1">
                  <CurrencyDollar className="h-4 w-4" /> Total Budget
                </label>
                <Input
                  type="number"
                  value={extractedProject.totalBudget || ""}
                  onChange={(e) => setExtractedProject({ ...extractedProject, totalBudget: parseInt(e.target.value) || undefined })}
                  placeholder="45000"
                />
              </div>
            </div>

            {/* Supplier Slots */}
            {extractedProject.supplierSlots.length > 0 && (
              <div className="space-y-2">
                <label className="text-sm font-medium">Vendor Categories Identified</label>
                <div className="flex flex-wrap gap-2">
                  {extractedProject.supplierSlots.map((slot, i) => (
                    <Badge
                      key={i}
                      variant={slot.priority === "must-have" ? "default" : "secondary"}
                    >
                      {slot.category}
                      {slot.budget && ` ($${slot.budget.toLocaleString()})`}
                    </Badge>
                  ))}
                </div>
              </div>
            )}

            <div className="flex gap-2 pt-4">
              <Button variant="outline" onClick={() => setStep("input")}>
                Back
              </Button>
              <Button onClick={createProject} disabled={isCreating} className="gap-2">
                {isCreating ? (
                  <>
                    <SpinnerGap className="h-4 w-4 animate-spin" />
                    Creating...
                  </>
                ) : (
                  <>
                    Create Project
                    <Check className="h-4 w-4" />
                  </>
                )}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Step 3: Confirm */}
      {step === "confirm" && (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <div className="w-16 h-16 rounded-full bg-emerald-500/20 flex items-center justify-center mb-4">
              <Check className="h-8 w-8 text-emerald-500" />
            </div>
            <p className="text-lg font-medium">Project Created!</p>
            <p className="text-muted-foreground">
              Redirecting to your new project...
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

