import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Layout } from "@/components/Layout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { Plus, AlertCircle, Share2, ImagePlus, CheckCircle2, BarChart2 } from "lucide-react";

const API_BASE = import.meta.env.VITE_API_URL ?? "";

const STAGE_BADGE = {
  no_campaign:  { label: "No Campaign",  className: "border-red-400 text-red-600 bg-transparent" },
  draft:        { label: "Draft",        className: "border-yellow-400 text-yellow-700 bg-yellow-50" },
  production:   { label: "Production",   className: "border-blue-400 text-blue-700 bg-blue-50" },
  publication:  { label: "Publication",  className: "border-purple-400 text-purple-700 bg-purple-50" },
  completed:    { label: "Completed",    className: "bg-green-600 text-white border-green-600" },
};

function StageBadge({ stage }) {
  const cfg = STAGE_BADGE[stage] ?? STAGE_BADGE.no_campaign;
  return (
    <Badge variant="outline" className={cfg.className}>
      {cfg.label}
    </Badge>
  );
}

export default function SocialMediaManager() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const qc = useQueryClient();

  const { data: episodesRaw, isLoading: loadingEpisodes } = useQuery({
    queryKey: ["/api/podcasts"],
    queryFn: async () => {
      const res = await fetch(`${API_BASE}/api/podcasts`);
      if (!res.ok) throw new Error("Failed to fetch episodes");
      return res.json();
    },
  });

  const { data: campaignsRaw } = useQuery({
    queryKey: ["/api/social-media/campaigns"],
    queryFn: async () => {
      const res = await fetch(`${API_BASE}/api/social-media/campaigns`);
      if (!res.ok) throw new Error("Failed to fetch campaigns");
      const json = await res.json();
      return json.data ?? [];
    },
  });

  const { data: unprocessedData } = useQuery({
    queryKey: ["/api/social-media/unprocessed-count"],
    queryFn: async () => {
      const res = await fetch(`${API_BASE}/api/social-media/unprocessed-count`);
      if (!res.ok) return { count: 0, episodes: [] };
      const json = await res.json();
      return json.data ?? { count: 0, episodes: [] };
    },
    refetchInterval: 30000,
  });

  const { mutate: createCampaign, isPending: isCreating } = useMutation({
    mutationFn: async (episodeId) => {
      const res = await fetch(`${API_BASE}/api/social-media/campaigns`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ episodeId }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ message: "Failed" }));
        throw new Error(err.message);
      }
      return res.json();
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["/api/social-media/campaigns"] });
      qc.invalidateQueries({ queryKey: ["/api/social-media/unprocessed-count"] });
      const campaignId = data.data?.id;
      if (campaignId) {
        setLocation(`/admin/social-media/campaign/${campaignId}/draft`);
      }
    },
    onError: (err) => {
      toast({ title: "Failed to create campaign", description: err.message, variant: "destructive" });
    },
  });

  const { data: publishedData } = useQuery({
    queryKey: ["/api/social-media/metrics/published-posts"],
    queryFn: async () => {
      const res = await fetch(`${API_BASE}/api/social-media/metrics/published-posts`);
      if (!res.ok) return [];
      const json = await res.json();
      return json.data ?? [];
    },
  });

  const episodes = episodesRaw ?? [];
  const campaigns = campaignsRaw ?? [];
  const unprocessedCount = unprocessedData?.count ?? 0;
  const unprocessedEpisodes = unprocessedData?.episodes ?? [];
  const publishedCampaigns = publishedData ?? [];

  // Map campaign by episodeId for quick lookup
  const campaignByEpisodeId = {};
  for (const c of campaigns) {
    if (c.episodeId) campaignByEpisodeId[c.episodeId] = c;
  }

  function getActionForStage(episode, campaign) {
    if (!campaign) return { label: "Create Campaign", action: () => createCampaign(episode.id) };
    if (campaign.stage === "draft") return { label: "Continue Draft", action: () => setLocation(`/admin/social-media/campaign/${campaign.id}/draft`) };
    if (campaign.stage === "production") return { label: "Continue Production", action: () => setLocation(`/admin/social-media/campaign/${campaign.id}/production`) };
    if (campaign.stage === "publication") return { label: "Go to Publication", action: () => setLocation(`/admin/social-media/campaign/${campaign.id}/publication`) };
    if (campaign.stage === "completed") return { label: "View", action: () => setLocation(`/admin/social-media/campaign/${campaign.id}/publication`) };
    return { label: "Open", action: () => setLocation(`/admin/social-media/campaign/${campaign.id}/draft`) };
  }

  return (
    <Layout>
      <div className="container mx-auto px-4 py-8 max-w-6xl">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <Share2 className="w-7 h-7 text-primary" />
            <h1 className="text-3xl font-display font-bold">Social Media Manager</h1>
          </div>
          <Button variant="outline" size="sm" onClick={() => setLocation("/admin/metrics")} className="gap-1.5">
            <BarChart2 className="w-4 h-4" /> Metrics
          </Button>
        </div>

        {/* Notification Banner */}
        {unprocessedCount > 0 && (
          <div className="mb-6 p-4 rounded-lg border border-amber-300 bg-amber-50 flex flex-col gap-3">
            <div className="flex items-center gap-2 text-amber-800 font-semibold">
              <AlertCircle className="w-5 h-5" />
              <span>{unprocessedCount} episode{unprocessedCount !== 1 ? "s" : ""} ready for social media content. Create their campaigns.</span>
            </div>
            <div className="flex flex-col gap-2">
              {unprocessedEpisodes.map((ep) => (
                <div key={ep.id} className="flex items-center justify-between bg-white rounded-md px-3 py-2 border border-amber-200">
                  <span className="text-sm font-medium text-foreground">{ep.title}</span>
                  <Button
                    size="sm"
                    onClick={() => createCampaign(ep.id)}
                    disabled={isCreating}
                    className="gap-1.5"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    Create Campaign
                  </Button>
                </div>
              ))}
            </div>
          </div>
        )}

        <Tabs defaultValue="episodes">
          <TabsList className="mb-6">
            <TabsTrigger value="episodes">Episodes</TabsTrigger>
            <TabsTrigger value="image-posts">Image Posts</TabsTrigger>
            <TabsTrigger value="published">
              Published
              {publishedCampaigns.length > 0 && (
                <span className="ml-1.5 bg-green-600 text-white text-xs rounded-full px-1.5 py-0.5 font-mono">
                  {publishedCampaigns.length}
                </span>
              )}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="episodes">
            {loadingEpisodes ? (
              <p className="text-muted-foreground">Loading episodes…</p>
            ) : episodes.length === 0 ? (
              <Card>
                <CardContent className="py-12 text-center text-muted-foreground">
                  No episodes found. Add episodes via the Backoffice first.
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-3">
                {episodes.map((episode) => {
                  const campaign = campaignByEpisodeId[episode.id];
                  const stage = campaign?.stage ?? "no_campaign";
                  const { label: actionLabel, action } = getActionForStage(episode, campaign);

                  return (
                    <Card key={episode.id} className="hover:shadow-md transition-shadow">
                      <CardContent className="py-4 px-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="font-semibold text-sm truncate">{episode.title}</p>
                            {episode.guestName && (
                              <span className="text-xs text-muted-foreground">• {episode.guestName}{episode.guestRole ? `, ${episode.guestRole}` : ""}</span>
                            )}
                          </div>
                          <div className="flex items-center gap-2 mt-1">
                            <Badge variant="outline" className="text-xs">{episode.category}</Badge>
                            <StageBadge stage={stage} />
                          </div>
                        </div>
                        <Button
                          size="sm"
                          variant={stage === "no_campaign" ? "default" : "outline"}
                          onClick={action}
                          disabled={isCreating}
                          className="shrink-0"
                        >
                          {actionLabel}
                        </Button>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            )}
          </TabsContent>

          <TabsContent value="image-posts">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Image-Only Campaigns</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col items-center py-10 text-center gap-4">
                <ImagePlus className="w-12 h-12 text-muted-foreground/40" />
                <p className="text-muted-foreground">Create social media content from images without a video episode.</p>
                <Button variant="outline" className="gap-2" disabled>
                  <Plus className="w-4 h-4" />
                  New Image Post (Coming Soon)
                </Button>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="published">
            {publishedCampaigns.length === 0 ? (
              <Card>
                <CardContent className="py-12 text-center text-muted-foreground">
                  <CheckCircle2 className="w-12 h-12 mx-auto mb-3 text-muted-foreground/30" />
                  <p>No completed campaigns yet.</p>
                  <p className="text-xs mt-1">Campaigns appear here once posts are marked as published.</p>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-3">
                {publishedCampaigns.map((c) => (
                  <Card key={c.id} className="hover:shadow-md transition-shadow">
                    <CardContent className="py-4 px-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="font-semibold text-sm truncate">
                            {c.episode?.title ?? `Campaign #${c.id}`}
                          </p>
                          {c.episode?.guestName && (
                            <span className="text-xs text-muted-foreground">• {c.episode.guestName}</span>
                          )}
                        </div>
                        <div className="flex items-center gap-2 mt-1">
                          <StageBadge stage={c.stage} />
                          <span className="text-xs text-muted-foreground">
                            {c.publishedCount} post{c.publishedCount !== 1 ? "s" : ""} published
                          </span>
                        </div>
                      </div>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setLocation(`/admin/social-media/campaign/${c.id}/publication`)}
                        className="shrink-0"
                      >
                        View
                      </Button>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </Layout>
  );
}
