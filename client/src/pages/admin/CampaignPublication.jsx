import { useState } from "react";
import { useParams, useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Layout } from "@/components/Layout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, CheckCircle2, Loader2, Download, ExternalLink } from "lucide-react";
import CampaignProgressBar from "@/components/admin/CampaignProgressBar";
import PlatformExportCard from "@/components/admin/PlatformExportCard";
import BackgroundPanel from "@/components/admin/BackgroundPanel";
import VideoTeaserPanel from "@/components/admin/VideoTeaserPanel";
import PostComposer from "@/components/admin/PostComposer";

const API_BASE = import.meta.env.VITE_API_URL ?? "";

const PLATFORM_ORDER = ["linkedin", "instagram", "facebook", "twitter", "story"];

function extractYoutubeVideoId(url) {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    if (parsed.hostname.includes("youtube.com")) {
      const v = parsed.searchParams.get("v");
      if (v) return v;
      const m = parsed.pathname.match(/\/(?:embed|shorts)\/([^/?]+)/);
      if (m) return m[1];
    }
    if (parsed.hostname === "youtu.be") return parsed.pathname.slice(1).split("?")[0];
  } catch {}
  return null;
}

function secondsToMmss(s) {
  if (!s) return "00:00";
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
}

export default function CampaignPublication() {
  const { id } = useParams();
  const campaignId = Number(id);
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const qc = useQueryClient();

  const { data: pubData, isLoading } = useQuery({
    queryKey: [`/api/social-media/campaigns/${campaignId}/publication`],
    queryFn: async () => {
      const res = await fetch(`${API_BASE}/api/social-media/campaigns/${campaignId}/publication`);
      if (!res.ok) throw new Error("Failed to load publication data");
      const json = await res.json();
      return json.data;
    },
    enabled: !isNaN(campaignId),
  });

  const { mutate: updateStatus } = useMutation({
    mutationFn: async ({ postId, status }) => {
      const res = await fetch(`${API_BASE}/api/social-media/campaigns/${campaignId}/posts/${postId}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) throw new Error("Failed to update status");
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [`/api/social-media/campaigns/${campaignId}/publication`] });
    },
  });

  const { mutate: markAllPublished, isPending: isMarkingAll } = useMutation({
    mutationFn: async () => {
      const allPosts = pubData?.allPosts ?? [];
      const toPublish = allPosts.filter((p) => p.status !== "published" && ["approved", "copied", "downloaded"].includes(p.status));
      await Promise.all(
        toPublish.map((p) =>
          fetch(`${API_BASE}/api/social-media/campaigns/${campaignId}/posts/${p.id}/status`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ status: "published" }),
          })
        )
      );
    },
    onSuccess: async () => {
      // Mark campaign as completed
      await fetch(`${API_BASE}/api/social-media/campaigns/${campaignId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stage: "completed" }),
      });
      qc.invalidateQueries({ queryKey: [`/api/social-media/campaigns/${campaignId}/publication`] });
      qc.invalidateQueries({ queryKey: ["/api/social-media/campaigns"] });
      toast({ title: "Campaign complete!", description: "All posts marked as published." });
    },
  });

  const { mutate: exportAll } = useMutation({
    mutationFn: async () => {
      const allPosts = pubData?.allPosts ?? [];
      const approved = allPosts.filter((p) => ["approved", "copied", "downloaded", "published"].includes(p.status));
      const lines = approved.map((p) => `=== ${p.postType} — ${p.platform} ===\n${p.content ?? ""}\n`);
      const episodeTitle = pubData?.episode?.title ?? "episode";
      const safeName = episodeTitle.replace(/[^a-z0-9]/gi, "-").toLowerCase().slice(0, 40);
      const blob = new Blob([lines.join("\n")], { type: "text/plain" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${safeName}-all-posts.txt`;
      a.click();
      URL.revokeObjectURL(url);
    },
  });

  const [openPreviewIds, setOpenPreviewIds] = useState(new Set());

  const togglePreview = (postId) => {
    setOpenPreviewIds((prev) => {
      const next = new Set(prev);
      if (next.has(postId)) next.delete(postId);
      else next.add(postId);
      return next;
    });
  };

  const campaign = pubData?.campaign;
  const episode = pubData?.episode;
  const selectedDraft = pubData?.selectedDraft;
  const postsByPlatform = pubData?.postsByPlatform ?? {};
  const allPosts = pubData?.allPosts ?? [];
  const assets = pubData?.assets ?? [];

  const publishedCount = allPosts.filter((p) => p.status === "published").length;
  const approvedCount = allPosts.filter((p) => ["approved", "copied", "downloaded", "published"].includes(p.status)).length;
  const isAllPublished = approvedCount > 0 && publishedCount === approvedCount;

  const videoId = extractYoutubeVideoId(episode?.videoUrl);
  const ytTeaserLink = videoId && selectedDraft?.teaserTimestampSeconds
    ? `https://youtu.be/${videoId}?t=${selectedDraft.teaserTimestampSeconds}`
    : videoId ? `https://youtu.be/${videoId}` : null;

  return (
    <Layout>
      <div className="container mx-auto px-4 py-8 max-w-6xl">
        <div className="flex items-center gap-3 mb-6">
          <Button variant="ghost" size="sm" onClick={() => setLocation("/admin/social-media")} className="gap-1.5">
            <ArrowLeft className="w-4 h-4" /> Back
          </Button>
          <div>
            <h1 className="text-2xl font-display font-bold">
              {episode?.title ?? "Campaign Publication"}
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
            <Loader2 className="w-5 h-5 animate-spin" /> Loading publication data…
          </div>
        ) : (
          <>
            {/* Completed banner */}
            {campaign?.stage === "completed" && (
              <div className="mb-6 p-4 rounded-lg bg-green-600 text-white flex items-center gap-3">
                <CheckCircle2 className="w-6 h-6 shrink-0" />
                <div>
                  <p className="font-bold">Campaign Complete!</p>
                  <p className="text-sm opacity-90">All posts have been published successfully.</p>
                </div>
              </div>
            )}

            {/* Progress */}
            <div className="mb-6">
              <CampaignProgressBar posts={allPosts} />
            </div>

            {/* Per-platform sections */}
            {PLATFORM_ORDER.filter((p) => postsByPlatform[p]?.length > 0).map((platform) => (
              <div key={platform} className="mb-8">
                <h2 className="text-lg font-bold capitalize mb-3 flex items-center gap-2">
                  <span>{platform}</span>
                  <Badge variant="outline" className="font-normal text-xs">
                    {postsByPlatform[platform].length} post{postsByPlatform[platform].length !== 1 ? "s" : ""}
                  </Badge>
                </h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {postsByPlatform[platform].map((post) => (
                    <div key={post.id}>
                      <PlatformExportCard
                        post={post}
                        episodeTitle={episode?.title}
                        onStatusChange={(postId, status) => updateStatus({ postId, status })}
                      />
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => togglePreview(post.id)}
                        className="gap-1 text-xs mt-1"
                      >
                        {openPreviewIds.has(post.id) ? "Close preview ▲" : "Preview post ▼"}
                      </Button>
                      {openPreviewIds.has(post.id) && (
                        <div className="mt-2 pb-4">
                          <PostComposer
                            backgroundUrl={campaign?.backgroundImageUrl}
                            content={post.content}
                            platform={post.platform}
                            episodeTitle={episode?.title}
                            guestName={episode?.guestName}
                            thumbnailUrl={episode?.thumbnailUrl}
                          />
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ))}

            {/* Visual Assets */}
            <div className="mb-8">
              <h2 className="text-lg font-bold mb-3">Visual Assets</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Thumbnail */}
                {episode?.thumbnailUrl && (
                  <div className="border rounded-lg p-4 space-y-3">
                    <p className="font-semibold text-sm">Episode Thumbnail</p>
                    <img
                      src={episode.thumbnailUrl}
                      alt="Episode thumbnail"
                      className="w-full rounded-md object-cover max-h-40"
                    />
                    <a
                      href={episode.thumbnailUrl}
                      download
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 text-xs font-medium hover:underline text-primary"
                    >
                      <Download className="w-3.5 h-3.5" /> Download thumbnail
                    </a>
                  </div>
                )}

                <VideoTeaserPanel
                  campaignId={campaignId}
                  campaign={campaign}
                  selectedDraft={selectedDraft}
                />
              </div>
            </div>

            {/* Uploaded Images (image-only campaigns) */}
            {assets.filter((a) => a.assetType === "manual_image").length > 0 && (
              <div className="mb-8">
                <h2 className="text-lg font-bold mb-3">Uploaded Images</h2>
                <div className="border rounded-lg p-4 space-y-3">
                  <div className="flex flex-wrap gap-3">
                    {assets
                      .filter((a) => a.assetType === "manual_image")
                      .map((asset) => (
                        <div key={asset.id} className="space-y-1.5">
                          <img
                            src={asset.fileUrl}
                            alt={asset.fileName}
                            className="w-28 h-28 rounded-md object-cover border"
                          />
                          <a
                            href={asset.fileUrl}
                            download={asset.fileName}
                            className="block text-xs text-primary hover:underline text-center"
                          >
                            Download
                          </a>
                        </div>
                      ))}
                  </div>
                </div>
              </div>
            )}

            {/* Background Generator */}
            <div className="mb-8">
              <BackgroundPanel campaignId={campaignId} campaign={campaign} />
            </div>

            {/* Bottom actions */}
            <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-4 border-t">
              <Button variant="outline" onClick={() => exportAll()} className="gap-2">
                <Download className="w-4 h-4" /> Export all as .txt
              </Button>
              {!isAllPublished && approvedCount > 0 && (
                <Button
                  onClick={() => markAllPublished()}
                  disabled={isMarkingAll}
                  className="gap-2"
                >
                  {isMarkingAll ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                  Mark all as published
                </Button>
              )}
            </div>
          </>
        )}
      </div>
    </Layout>
  );
}
