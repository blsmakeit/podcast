import { useState } from "react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { Copy, Download, CheckCircle2 } from "lucide-react";
import CharCountBadge from "./CharCountBadge";

const POST_TYPE_LABELS = {
  teaser: "Teaser",
  brevemente: "Brevemente",
  guest: "Convidado",
  insight: "Insight",
  launch: "Lançamento",
  reengage: "Re-engagement",
  carousel: "Carousel",
  video_teaser: "Video Teaser",
};

const STATUS_COLORS = {
  approved: "border-green-300 text-green-700 bg-green-50",
  copied: "border-blue-300 text-blue-700 bg-blue-50",
  downloaded: "border-blue-300 text-blue-700 bg-blue-50",
  published: "bg-green-600 text-white border-green-600",
};

export default function PlatformExportCard({ post, episodeTitle, onStatusChange }) {
  const { toast } = useToast();
  const [localContent, setLocalContent] = useState(post.content ?? "");

  const handleCopy = () => {
    navigator.clipboard.writeText(localContent);
    toast({ title: "Copied", description: `${post.platform} content copied to clipboard.` });
    onStatusChange(post.id, "copied");
  };

  const handleDownload = () => {
    const safeName = (episodeTitle ?? "episode").replace(/[^a-z0-9]/gi, "-").toLowerCase().slice(0, 40);
    const filename = `${safeName}-${post.postType}-${post.platform}.txt`;
    const blob = new Blob([localContent], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
    toast({ title: "Downloaded", description: filename });
    onStatusChange(post.id, "downloaded");
  };

  const handleMarkPublished = () => {
    onStatusChange(post.id, "published");
    toast({ title: "Marked as published" });
  };

  const statusColor = STATUS_COLORS[post.status] ?? "";

  return (
    <Card>
      <CardHeader className="pb-2 flex flex-row items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold capitalize">{POST_TYPE_LABELS[post.postType] ?? post.postType}</span>
          <span className="text-muted-foreground text-xs">·</span>
          <span className="text-xs font-medium capitalize text-muted-foreground">{post.platform}</span>
        </div>
        {post.status && (
          <Badge variant="outline" className={`text-xs ${statusColor}`}>
            {post.status === "published" ? <><CheckCircle2 className="w-3 h-3 mr-1" /> Published</> : post.status}
          </Badge>
        )}
      </CardHeader>
      <CardContent className="space-y-2">
        <Textarea
          value={localContent}
          onChange={(e) => setLocalContent(e.target.value)}
          rows={6}
          className="text-xs resize-y"
        />
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <CharCountBadge current={localContent.length} platform={post.platform} />
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={handleCopy} className="gap-1.5 h-8">
              <Copy className="w-3.5 h-3.5" /> Copy for {post.platform}
            </Button>
            <Button size="sm" variant="outline" onClick={handleDownload} className="gap-1.5 h-8">
              <Download className="w-3.5 h-3.5" /> Download .txt
            </Button>
            {post.status !== "published" && (
              <Button size="sm" onClick={handleMarkPublished} className="gap-1.5 h-8">
                <CheckCircle2 className="w-3.5 h-3.5" /> Mark Published
              </Button>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
