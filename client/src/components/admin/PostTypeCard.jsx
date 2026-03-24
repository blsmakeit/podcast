import { useState } from "react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { Loader2, CheckCircle2, RefreshCw, Copy } from "lucide-react";
import CharCountBadge from "./CharCountBadge";

const POST_TYPE_META = {
  teaser:       { label: "Teaser", description: "\"O episódio está no ar\" — Episode is live announcement", platforms: ["linkedin", "instagram"] },
  brevemente:   { label: "Brevemente", description: "Pre-launch teaser building anticipation", platforms: ["linkedin", "instagram", "story"] },
  guest:        { label: "Convidado", description: "Guest spotlight post", platforms: ["linkedin", "instagram"] },
  insight:      { label: "Insight", description: "Thought-provoking key insight post", platforms: ["linkedin", "instagram"] },
  launch:       { label: "Lançamento", description: "Full launch day post", platforms: ["linkedin", "instagram", "facebook"] },
  reengage:     { label: "Re-engagement", description: "1 week after launch, bring the episode back", platforms: ["linkedin", "instagram"] },
  carousel:     { label: "Carousel", description: "5-slide educational carousel summary", platforms: ["instagram"] },
  video_teaser: { label: "Video Teaser", description: "Accompanying the 20-second video clip", platforms: ["instagram", "linkedin"] },
};

const STATUS_BADGE = {
  not_generated: { label: "Not Generated", className: "text-muted-foreground border-muted" },
  generating:    { label: "Generating…",   className: "text-blue-600 border-blue-300 bg-blue-50" },
  draft:         { label: "Draft",          className: "text-yellow-700 border-yellow-300 bg-yellow-50" },
  approved:      { label: "Approved",       className: "text-green-700 border-green-300 bg-green-50" },
  copied:        { label: "Copied",         className: "text-green-700 border-green-300 bg-green-50" },
  published:     { label: "Published",      className: "text-green-700 border-green-300 bg-green-600 text-white" },
};

function CarouselView({ slides }) {
  const { toast } = useToast();
  const copyAll = () => {
    const text = slides.map((s) => `Slide ${s.slideNumber}: ${s.title}\n${s.bodyText}`).join("\n\n");
    navigator.clipboard.writeText(text);
    toast({ title: "Copied", description: "All slide text copied to clipboard." });
  };
  const downloadJson = () => {
    const blob = new Blob([JSON.stringify(slides, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "carousel-slides.json";
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-3">
      <div className="flex overflow-x-auto gap-3 pb-2">
        {slides.map((slide) => (
          <div key={slide.slideNumber} className="shrink-0 w-44 bg-muted/50 rounded-lg p-3 border">
            <span className="text-xs font-bold text-primary">Slide {slide.slideNumber}</span>
            <p className="font-semibold text-sm mt-1 leading-snug">{slide.title}</p>
            <p className="text-xs text-muted-foreground mt-1">{slide.bodyText}</p>
            {slide.visualHint && (
              <p className="text-xs italic text-muted-foreground/70 mt-1.5">{slide.visualHint}</p>
            )}
          </div>
        ))}
      </div>
      <div className="flex gap-2">
        <Button size="sm" variant="outline" onClick={copyAll} className="gap-1.5">
          <Copy className="w-3.5 h-3.5" /> Copy all slide text
        </Button>
        <Button size="sm" variant="outline" onClick={downloadJson}>
          Download as JSON
        </Button>
      </div>
    </div>
  );
}

export default function PostTypeCard({ postType, posts = [], onGenerate, onApprove, onContentChange, isGenerating }) {
  const { toast } = useToast();
  const meta = POST_TYPE_META[postType] ?? { label: postType, description: "", platforms: [] };

  // Overall status: use the "worst" (least complete) status across all posts
  const statuses = posts.map((p) => p.status ?? "not_generated");
  const overallStatus = statuses.length === 0
    ? "not_generated"
    : statuses.includes("not_generated")
    ? "not_generated"
    : statuses.includes("generating")
    ? "generating"
    : statuses.includes("draft")
    ? "draft"
    : "approved";

  const statusCfg = STATUS_BADGE[overallStatus] ?? STATUS_BADGE.not_generated;

  const handleCopy = (content) => {
    navigator.clipboard.writeText(content);
    toast({ title: "Copied", description: "Content copied to clipboard." });
  };

  const postByPlatform = {};
  for (const p of posts) {
    postByPlatform[p.platform] = p;
  }

  return (
    <Card className="flex flex-col">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="font-bold text-sm">{meta.label}</p>
            <p className="text-xs text-muted-foreground">{meta.description}</p>
          </div>
          <Badge variant="outline" className={`text-xs shrink-0 ${statusCfg.className}`}>
            {isGenerating && overallStatus === "not_generated" ? (
              <><Loader2 className="w-3 h-3 animate-spin mr-1" /> Generating…</>
            ) : statusCfg.label}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="flex-1 space-y-3">
        {overallStatus === "not_generated" ? (
          <Button
            onClick={() => onGenerate(postType, meta.platforms)}
            disabled={isGenerating}
            className="w-full gap-2"
            size="sm"
          >
            {isGenerating ? (
              <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Generating…</>
            ) : "Generate"}
          </Button>
        ) : (
          <>
            {postType === "carousel" && postByPlatform.instagram?.content ? (
              (() => {
                try {
                  const slides = JSON.parse(postByPlatform.instagram.content);
                  return <CarouselView slides={slides} />;
                } catch {
                  return <p className="text-xs text-muted-foreground">Unable to parse carousel data.</p>;
                }
              })()
            ) : (
              <Tabs defaultValue={meta.platforms[0]} className="w-full">
                <TabsList className="h-8 flex-wrap">
                  {meta.platforms.map((p) => (
                    <TabsTrigger key={p} value={p} className="text-xs capitalize">
                      {p}
                    </TabsTrigger>
                  ))}
                </TabsList>
                {meta.platforms.map((platform) => {
                  const post = postByPlatform[platform];
                  const content = post?.content ?? "";
                  return (
                    <TabsContent key={platform} value={platform} className="space-y-1.5">
                      <Textarea
                        value={content}
                        onChange={(e) => post && onContentChange(post.id, e.target.value)}
                        rows={5}
                        className="text-xs resize-y"
                        placeholder={`${platform} content will appear here…`}
                        disabled={!post}
                      />
                      <div className="flex items-center justify-between">
                        <CharCountBadge current={content.length} platform={platform} />
                        {post && (
                          <Button size="sm" variant="ghost" onClick={() => handleCopy(content)} className="gap-1.5 h-7 text-xs">
                            <Copy className="w-3 h-3" /> Copy
                          </Button>
                        )}
                      </div>
                    </TabsContent>
                  );
                })}
              </Tabs>
            )}

            <div className="flex items-center justify-between gap-2 pt-2 border-t">
              {overallStatus === "draft" && (
                <Button
                  size="sm"
                  onClick={() => {
                    const firstDraftPost = posts.find((p) => p.status === "draft");
                    if (firstDraftPost) onApprove(firstDraftPost.id);
                  }}
                  className="gap-1.5"
                >
                  <CheckCircle2 className="w-3.5 h-3.5" /> Approve
                </Button>
              )}
              {overallStatus === "approved" && (
                <span className="text-xs text-green-600 font-medium flex items-center gap-1">
                  <CheckCircle2 className="w-3.5 h-3.5" /> Approved
                </span>
              )}
              <Button
                size="sm"
                variant="ghost"
                onClick={() => onGenerate(postType, meta.platforms)}
                disabled={isGenerating}
                className="gap-1.5 ml-auto text-xs"
              >
                <RefreshCw className="w-3 h-3" /> Regenerate
              </Button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
