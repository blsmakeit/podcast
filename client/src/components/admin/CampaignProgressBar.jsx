import { Progress } from "@/components/ui/progress";

const PLATFORM_LABELS = {
  linkedin: "LinkedIn",
  instagram: "Instagram",
  facebook: "Facebook",
  twitter: "Twitter",
  story: "Story",
};

export default function CampaignProgressBar({ posts }) {
  const allPosts = posts ?? [];
  const published = allPosts.filter((p) => p.status === "published").length;
  const total = allPosts.length;

  // Per-platform breakdown
  const platforms = [...new Set(allPosts.map((p) => p.platform))];
  const byPlatform = {};
  for (const platform of platforms) {
    const platformPosts = allPosts.filter((p) => p.platform === platform);
    const approvedOrBetter = platformPosts.filter((p) => ["approved", "copied", "downloaded", "published"].includes(p.status));
    byPlatform[platform] = { total: platformPosts.length, approved: approvedOrBetter.length };
  }

  return (
    <div className="space-y-3 p-4 bg-muted/30 rounded-lg border">
      <div className="flex items-center justify-between">
        <span className="text-sm font-semibold">Overall Progress</span>
        <span className="text-sm text-muted-foreground">{published}/{total} published</span>
      </div>
      <Progress value={total > 0 ? (published / total) * 100 : 0} className="h-2" />
      <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
        {platforms.map((platform) => {
          const { approved, total: ptotal } = byPlatform[platform];
          return (
            <span key={platform} className="font-medium">
              {PLATFORM_LABELS[platform] ?? platform}: {approved}/{ptotal} approved
            </span>
          );
        })}
      </div>
    </div>
  );
}
