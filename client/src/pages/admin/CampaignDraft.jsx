import { useState } from "react";
import { useParams, useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Layout } from "@/components/Layout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, Sparkles, Loader2, CheckCircle2, ExternalLink, ArrowRight, RefreshCw } from "lucide-react";

const API_BASE = import.meta.env.VITE_API_URL ?? "";

function extractYoutubeVideoId(url) {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    if (parsed.hostname.includes("youtube.com")) {
      const v = parsed.searchParams.get("v");
      if (v) return v;
      const match = parsed.pathname.match(/\/(?:embed|shorts)\/([^/?]+)/);
      if (match) return match[1];
    }
    if (parsed.hostname === "youtu.be") return parsed.pathname.slice(1).split("?")[0];
  } catch {}
  return null;
}

function secondsToMmss(seconds) {
  if (!seconds) return "00:00";
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function DraftCard({ draft, episode, onSelect, isSelected }) {
  const videoId = extractYoutubeVideoId(episode?.videoUrl);
  const ytLink = videoId && draft.teaserTimestampSeconds
    ? `https://youtu.be/${videoId}?t=${draft.teaserTimestampSeconds}`
    : null;

  return (
    <Card className={`transition-all duration-200 ${isSelected ? "ring-2 ring-green-500 shadow-lg" : "hover:shadow-md"}`}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <span className="text-lg font-bold text-primary">★{draft.rank}</span>
            <Badge className="bg-primary text-white text-xs">{draft.theme}</Badge>
            {isSelected && (
              <Badge className="bg-green-600 text-white gap-1">
                <CheckCircle2 className="w-3 h-3" /> Selected
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">Impact:</span>
            <Progress value={draft.impactScore * 10} className="w-20 h-2" />
            <span className="text-sm font-bold">{draft.impactScore}/10</span>
          </div>
        </div>
        {draft.impactReason && (
          <p className="text-xs text-muted-foreground italic mt-1">{draft.impactReason}</p>
        )}
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Key Insight */}
        <div className="pl-3 border-l-4 border-primary bg-primary/5 rounded-r py-2 pr-2">
          <p className="text-xs font-semibold text-primary mb-1 uppercase tracking-wide">Key Insight</p>
          <p className="text-sm">{draft.insight}</p>
        </div>

        {/* Hook */}
        <p className="font-bold text-base leading-snug">{draft.hook}</p>

        {/* Captions */}
        <Tabs defaultValue="linkedin">
          <TabsList className="h-8">
            <TabsTrigger value="linkedin" className="text-xs">LinkedIn</TabsTrigger>
            <TabsTrigger value="instagram" className="text-xs">Instagram</TabsTrigger>
          </TabsList>
          <TabsContent value="linkedin">
            <div className="max-h-36 overflow-y-auto text-xs bg-muted/40 rounded p-2 whitespace-pre-wrap">
              {draft.linkedinCaption}
            </div>
            <p className="text-xs text-muted-foreground mt-1">{draft.linkedinCaption?.length ?? 0} chars</p>
          </TabsContent>
          <TabsContent value="instagram">
            <div className="max-h-36 overflow-y-auto text-xs bg-muted/40 rounded p-2 whitespace-pre-wrap">
              {draft.instagramCaption}
            </div>
            <p className="text-xs text-muted-foreground mt-1">{draft.instagramCaption?.length ?? 0} chars</p>
          </TabsContent>
        </Tabs>

        {/* Hashtags */}
        {draft.hashtags?.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {draft.hashtags.map((tag, i) => (
              <span key={i} className="text-xs bg-muted text-muted-foreground px-2 py-0.5 rounded-full">#{tag}</span>
            ))}
          </div>
        )}

        {/* Teaser suggestion */}
        {draft.teaserTimestampSeconds != null && (
          <div className="bg-blue-50 border border-blue-200 rounded p-2 space-y-1">
            <p className="text-xs font-semibold text-blue-700">
              Best 20s clip starts at {secondsToMmss(draft.teaserTimestampSeconds)}
            </p>
            {draft.teaserReason && (
              <p className="text-xs text-blue-600">Why: {draft.teaserReason}</p>
            )}
            {ytLink && (
              <a
                href={ytLink}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-xs text-blue-700 font-medium hover:underline"
              >
                Open in YouTube <ExternalLink className="w-3 h-3" />
              </a>
            )}
          </div>
        )}

        {/* Actions */}
        <div className="pt-2 border-t">
          {isSelected ? (
            <p className="text-sm text-green-600 font-medium flex items-center gap-1">
              <CheckCircle2 className="w-4 h-4" /> This draft is selected
            </p>
          ) : (
            <Button size="sm" onClick={onSelect} className="w-full gap-1.5">
              Select this draft <ArrowRight className="w-3.5 h-3.5" />
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

export default function CampaignDraft() {
  const { id } = useParams();
  const campaignId = Number(id);
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const qc = useQueryClient();

  const { data: campaignData, isLoading } = useQuery({
    queryKey: [`/api/social-media/campaigns/${campaignId}`],
    queryFn: async () => {
      const res = await fetch(`${API_BASE}/api/social-media/campaigns/${campaignId}`);
      if (!res.ok) throw new Error("Failed to load campaign");
      const json = await res.json();
      return json.data;
    },
    enabled: !isNaN(campaignId),
  });

  const { mutate: generateDrafts, isPending: isGenerating } = useMutation({
    mutationFn: async () => {
      const res = await fetch(`${API_BASE}/api/social-media/campaigns/${campaignId}/drafts/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ message: "Generation failed" }));
        throw new Error(err.message);
      }
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [`/api/social-media/campaigns/${campaignId}`] });
      toast({ title: "Drafts generated", description: "5 draft suggestions are ready for review." });
    },
    onError: (err) => {
      toast({ title: "Generation failed", description: err.message, variant: "destructive" });
    },
  });

  const { mutate: selectDraft, isPending: isSelecting } = useMutation({
    mutationFn: async (draftId) => {
      const res = await fetch(`${API_BASE}/api/social-media/campaigns/${campaignId}/drafts/${draftId}/select`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
      });
      if (!res.ok) throw new Error("Failed to select draft");
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [`/api/social-media/campaigns/${campaignId}`] });
      toast({ title: "Draft selected", description: "Moving to Production stage." });
    },
    onError: (err) => {
      toast({ title: "Failed to select draft", description: err.message, variant: "destructive" });
    },
  });

  const campaign = campaignData;
  const episode = campaign?.episode;
  const drafts = (campaign?.drafts ?? []).sort((a, b) => a.rank - b.rank);
  const selectedDraft = drafts.find((d) => d.isSelected);
  const hasDrafts = drafts.length > 0;

  return (
    <Layout>
      <div className="container mx-auto px-4 py-8 max-w-6xl">
        <div className="flex items-center gap-3 mb-6">
          <Button variant="ghost" size="sm" onClick={() => setLocation("/admin/social-media")} className="gap-1.5">
            <ArrowLeft className="w-4 h-4" /> Back
          </Button>
          <div>
            <h1 className="text-2xl font-display font-bold">
              {episode?.title ?? "Campaign Draft"}
            </h1>
            {episode?.guestName && (
              <p className="text-sm text-muted-foreground">
                {episode.guestName}{episode.guestRole ? ` — ${episode.guestRole}` : ""}
              </p>
            )}
          </div>
        </div>

        {isLoading ? (
          <div className="flex items-center gap-2 text-muted-foreground py-12 justify-center">
            <Loader2 className="w-5 h-5 animate-spin" /> Loading campaign…
          </div>
        ) : !hasDrafts ? (
          <div className="flex flex-col items-center py-16 gap-6">
            <div className="text-center space-y-2">
              <h2 className="text-xl font-semibold">No drafts generated yet</h2>
              <p className="text-muted-foreground max-w-md">
                Click below to let Claude analyse this episode and generate 5 ranked social media draft strategies.
              </p>
            </div>
            <Button
              size="lg"
              onClick={() => generateDrafts()}
              disabled={isGenerating}
              className="gap-2 px-8"
            >
              {isGenerating ? (
                <><Loader2 className="w-5 h-5 animate-spin" /> Claude is analysing your episode…</>
              ) : (
                <><Sparkles className="w-5 h-5" /> Generate AI Analysis</>
              )}
            </Button>
          </div>
        ) : (
          <>
            {/* Draft grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
              {drafts.map((draft) => (
                <DraftCard
                  key={draft.id}
                  draft={draft}
                  episode={episode}
                  isSelected={draft.isSelected}
                  onSelect={() => selectDraft(draft.id)}
                />
              ))}
            </div>

            {/* Bottom actions */}
            <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-4 border-t">
              <Button
                variant="outline"
                onClick={() => generateDrafts()}
                disabled={isGenerating || isSelecting}
                className="gap-2"
              >
                {isGenerating ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                Regenerate all drafts
              </Button>
              <Button
                onClick={() => setLocation(`/admin/social-media/campaign/${campaignId}/production`)}
                disabled={!selectedDraft || isSelecting}
                className="gap-2"
              >
                Continue to Production <ArrowRight className="w-4 h-4" />
              </Button>
            </div>
          </>
        )}
      </div>
    </Layout>
  );
}
