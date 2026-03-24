import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Loader2, RefreshCw, Trash2, Sparkles } from "lucide-react";

const API_BASE = import.meta.env.VITE_API_URL ?? "";

const STYLES = [
  { value: "aurora", label: "Aurora" },
  { value: "minimal", label: "Minimal" },
  { value: "grid", label: "Grid" },
];

export default function BackgroundPanel({ campaignId, campaign }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [style, setStyle] = useState(campaign?.backgroundStyle ?? "aurora");
  const [previewSeed, setPreviewSeed] = useState(campaign ? campaignId : 42);
  const [isGeneratingAI, setIsGeneratingAI] = useState(false);
  const [aiResult, setAiResult] = useState(null);

  const previewUrl = `${API_BASE}/api/social-media/backgrounds/preview?style=${style}&seed=${previewSeed}`;

  const { mutate: generate, isPending: isGenerating } = useMutation({
    mutationFn: async () => {
      const res = await fetch(`${API_BASE}/api/social-media/campaigns/${campaignId}/background/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ style, seed: previewSeed }),
      });
      if (!res.ok) throw new Error("Failed to save background");
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [`/api/social-media/campaigns/${campaignId}`] });
      toast({ title: "Background saved", description: `${style} style applied to campaign.` });
    },
    onError: (err) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const { mutate: clear, isPending: isClearing } = useMutation({
    mutationFn: async () => {
      const res = await fetch(`${API_BASE}/api/social-media/campaigns/${campaignId}/background`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("Failed to clear background");
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [`/api/social-media/campaigns/${campaignId}`] });
      toast({ title: "Background cleared" });
    },
  });

  const randomise = () => setPreviewSeed(Math.floor(Math.random() * 9999));

  const handleGenerateAI = async () => {
    setIsGeneratingAI(true);
    try {
      const res = await fetch(`${API_BASE}/api/social-media/backgrounds/generate-ai`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ campaignId, style, width: 1080, height: 1080 }),
      });
      if (!res.ok) throw new Error("Generation failed");
      const json = await res.json();
      setAiResult(json.data);
      qc.invalidateQueries({ queryKey: [`/api/social-media/campaigns/${campaignId}`] });
      if (json.data?.source === "gemini") {
        toast({ title: "AI background generated", description: "Gemini Imagen background saved to campaign." });
      } else {
        toast({ title: "Geometric background applied", description: "Gemini unavailable — SVG fallback used." });
      }
    } catch (err) {
      toast({ title: "Generation failed", description: err.message, variant: "destructive" });
    } finally {
      setIsGeneratingAI(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">PCB Background Generator</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* AI Generation */}
        <div className="space-y-3 pb-4 border-b">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">AI Generation</p>
          <Button
            className="w-full gap-2"
            onClick={handleGenerateAI}
            disabled={isGeneratingAI}
          >
            {isGeneratingAI ? (
              <><Loader2 className="w-4 h-4 animate-spin" /> Gemini is creating your background...</>
            ) : (
              <><Sparkles className="w-4 h-4" /> Generate with Gemini AI</>
            )}
          </Button>
          {aiResult && (
            <div className="space-y-2">
              {aiResult.source === "gemini" && aiResult.fileUrl && (
                <>
                  <img src={`${API_BASE}${aiResult.fileUrl}`} className="w-full h-24 object-cover rounded" alt="AI background" />
                  <Badge className="bg-green-600 text-white">AI Generated — Gemini Imagen</Badge>
                </>
              )}
              {aiResult.source === "svg" && (
                <Badge variant="outline" className="text-muted-foreground">
                  Geometric fallback (Gemini unavailable)
                </Badge>
              )}
            </div>
          )}
        </div>

        {/* Style selector */}
        <div className="flex gap-2">
          {STYLES.map((s) => (
            <button
              key={s.value}
              onClick={() => setStyle(s.value)}
              className={`px-3 py-1.5 text-xs rounded-md border transition-colors ${
                style === s.value
                  ? "bg-primary text-primary-foreground border-primary"
                  : "border-border hover:border-primary"
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>

        {/* Preview */}
        <div className="relative rounded-lg overflow-hidden border">
          <img
            src={previewUrl}
            alt="Background preview"
            className="w-full h-32 object-cover"
            key={previewUrl}
          />
          {campaign?.backgroundStyle && campaign?.backgroundImageUrl && (
            <div className="absolute top-2 right-2 bg-green-600 text-white text-xs px-2 py-0.5 rounded-full">
              Active
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2 flex-wrap">
          <Button
            size="sm"
            variant="outline"
            onClick={randomise}
            className="gap-1.5"
          >
            <RefreshCw className="w-3.5 h-3.5" /> Randomise
          </Button>
          <Button
            size="sm"
            onClick={() => generate()}
            disabled={isGenerating}
            className="gap-1.5"
          >
            {isGenerating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
            Save to Campaign
          </Button>
          {campaign?.backgroundImageUrl && (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => clear()}
              disabled={isClearing}
              className="gap-1.5 text-destructive hover:text-destructive"
            >
              <Trash2 className="w-3.5 h-3.5" /> Clear
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
