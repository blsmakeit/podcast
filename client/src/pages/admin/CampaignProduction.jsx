import { useParams, useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Layout } from "@/components/Layout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, ArrowRight, Loader2 } from "lucide-react";
import PostTypeCard from "@/components/admin/PostTypeCard";

const API_BASE = import.meta.env.VITE_API_URL ?? "";

const ALL_POST_TYPES = [
  "teaser",
  "brevemente",
  "guest",
  "insight",
  "launch",
  "reengage",
  "carousel",
  "video_teaser",
];

export default function CampaignProduction() {
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

  const { mutate: generatePost, variables: generatingVars, isPending: isGenerating } = useMutation({
    mutationFn: async ({ postType, platforms }) => {
      const res = await fetch(`${API_BASE}/api/social-media/campaigns/${campaignId}/posts/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ postType, platforms }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ message: "Generation failed" }));
        throw new Error(err.message);
      }
      return res.json();
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: [`/api/social-media/campaigns/${campaignId}`] });
      toast({ title: "Generated", description: `${vars.postType} post is ready for review.` });
    },
    onError: (err) => {
      toast({ title: "Generation failed", description: err.message, variant: "destructive" });
    },
  });

  const { mutate: approvePost } = useMutation({
    mutationFn: async (postId) => {
      const res = await fetch(`${API_BASE}/api/social-media/campaigns/${campaignId}/posts/${postId}/approve`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
      });
      if (!res.ok) throw new Error("Failed to approve post");
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [`/api/social-media/campaigns/${campaignId}`] });
      toast({ title: "Post approved" });
    },
    onError: (err) => {
      toast({ title: "Approval failed", description: err.message, variant: "destructive" });
    },
  });

  const { mutate: updatePostContent } = useMutation({
    mutationFn: async ({ postId, content }) => {
      const res = await fetch(`${API_BASE}/api/social-media/campaigns/${campaignId}/posts/${postId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content }),
      });
      if (!res.ok) throw new Error("Failed to update post");
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [`/api/social-media/campaigns/${campaignId}`] });
    },
  });

  const campaign = campaignData;
  const episode = campaign?.episode;
  const drafts = campaign?.drafts ?? [];
  const posts = campaign?.posts ?? [];
  const selectedDraft = drafts.find((d) => d.isSelected) ?? drafts[0];

  // Group posts by postType
  const postsByType = {};
  for (const post of posts) {
    if (!postsByType[post.postType]) postsByType[post.postType] = [];
    postsByType[post.postType].push(post);
  }

  const approvedTypes = ALL_POST_TYPES.filter((t) => {
    const typePosts = postsByType[t] ?? [];
    return typePosts.some((p) => ["approved", "copied", "downloaded", "published"].includes(p.status));
  });
  const readyCount = approvedTypes.length;
  const hasAtLeastOneApproved = readyCount >= 1;

  return (
    <Layout>
      <div className="container mx-auto px-4 py-8 max-w-6xl">
        <div className="flex items-center gap-3 mb-6">
          <Button variant="ghost" size="sm" onClick={() => setLocation("/admin/social-media")} className="gap-1.5">
            <ArrowLeft className="w-4 h-4" /> Back
          </Button>
          <div>
            <h1 className="text-2xl font-display font-bold">
              {episode?.title ?? "Campaign Production"}
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
        ) : (
          <>
            {/* Selected draft summary */}
            {selectedDraft && (
              <div className="mb-6 p-3 rounded-lg border bg-muted/30 flex flex-wrap items-center gap-3">
                <Badge className="bg-primary text-white">{selectedDraft.theme}</Badge>
                <span className="text-sm font-medium">{selectedDraft.hook}</span>
                {selectedDraft.timestamp && (
                  <Badge variant="outline" className="font-mono text-xs">{selectedDraft.timestamp}</Badge>
                )}
              </div>
            )}

            {/* Progress */}
            <div className="mb-6">
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-sm font-medium">Campaign Progress</span>
                <span className="text-sm text-muted-foreground">{readyCount}/{ALL_POST_TYPES.length} post types ready</span>
              </div>
              <Progress value={(readyCount / ALL_POST_TYPES.length) * 100} className="h-2" />
            </div>

            {/* Post type grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
              {ALL_POST_TYPES.map((postType) => (
                <PostTypeCard
                  key={postType}
                  postType={postType}
                  posts={postsByType[postType] ?? []}
                  isGenerating={isGenerating && generatingVars?.postType === postType}
                  onGenerate={(type, platforms) => generatePost({ postType: type, platforms })}
                  onApprove={(postId) => approvePost(postId)}
                  onContentChange={(postId, content) => updatePostContent({ postId, content })}
                />
              ))}
            </div>

            <div className="flex justify-end border-t pt-4">
              <Button
                onClick={() => setLocation(`/admin/social-media/campaign/${campaignId}/publication`)}
                disabled={!hasAtLeastOneApproved}
                className="gap-2"
              >
                Continue to Publication <ArrowRight className="w-4 h-4" />
              </Button>
            </div>
          </>
        )}
      </div>
    </Layout>
  );
}
