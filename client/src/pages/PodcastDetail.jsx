import { useEffect, useRef } from "react";
import { useParams, useLocation, Link } from "wouter";
import { useEpisode } from "@/hooks/use-episodes";
import { Layout } from "@/components/Layout";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Loader2, Calendar, Share2, ArrowLeft, Play } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

export default function PodcastDetail() {
  const { id } = useParams();
  const [location] = useLocation();
  const { data: podcast, isLoading, error } = useEpisode(Number(id));
  const videoRef = useRef(null);
  const { toast } = useToast();

  // Seek to timestamp from URL query param e.g. ?t=01:30
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const timestamp = params.get("t");
    if (timestamp && videoRef.current) {
      const parts = timestamp.split(":").map(Number);
      let totalSeconds = 0;
      if (parts.length === 2) {
        totalSeconds = parts[0] * 60 + parts[1];
      } else if (parts.length === 3) {
        totalSeconds = parts[0] * 3600 + parts[1] * 60 + parts[2];
      }
      if (!isNaN(totalSeconds)) {
        videoRef.current.currentTime = totalSeconds;
        videoRef.current.play().catch(() => {
          // Auto-play may be blocked — user can press play manually
        });
      }
    }
  }, [location, isLoading]);

  // Web Share API with clipboard fallback
  const handleShare = async () => {
    const url = window.location.href;
    const title = podcast?.title ?? "MAKEIT.TECH Podcast";
    if (navigator.share) {
      try {
        await navigator.share({ title, url });
      } catch {
        // User cancelled — do nothing
      }
    } else {
      await navigator.clipboard.writeText(url);
      toast({ title: "Link copied!", description: "Episode link has been copied to your clipboard." });
    }
  };

  const seekTo = (time) => {
    if (!videoRef.current) return;
    const parts = time.split(":").map(Number);
    let seconds = 0;
    if (parts.length === 2) seconds = parts[0] * 60 + parts[1];
    else if (parts.length === 3) seconds = parts[0] * 3600 + parts[1] * 60 + parts[2];
    videoRef.current.currentTime = seconds;
    videoRef.current.play().catch(() => {});
  };

  if (isLoading) {
    return (
      <Layout>
        <div className="min-h-[60vh] flex items-center justify-center">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      </Layout>
    );
  }

  if (error || !podcast) {
    return (
      <Layout>
        <div className="min-h-[60vh] flex flex-col items-center justify-center text-center px-4">
          <h2 className="text-3xl font-bold font-display mb-4">Episode Not Found</h2>
          <p className="text-muted-foreground mb-8">The episode you're looking for doesn't exist or has been removed.</p>
          <Link href="/">
            <Button>Back to Home</Button>
          </Link>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="container mx-auto px-4 py-8">
        <Link href="/">
          <Button variant="ghost" className="mb-6 pl-0 gap-2 hover:bg-transparent hover:text-primary">
            <ArrowLeft className="w-4 h-4" /> Back to Episodes
          </Button>
        </Link>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-10">
          {/* Main: Video & details */}
          <div className="lg:col-span-2 space-y-8">
            <div className="relative rounded-2xl overflow-hidden shadow-2xl bg-black aspect-video">
              <video
                ref={videoRef}
                src={podcast.videoUrl}
                poster={podcast.thumbnailUrl}
                controls
                className="w-full h-full object-contain"
              >
                Your browser does not support the video tag.
              </video>
            </div>

            <div>
              <div className="flex items-start justify-between gap-4 mb-4">
                <h1 className="font-display font-bold text-3xl md:text-4xl leading-tight">
                  {podcast.title}
                </h1>
                <Button
                  variant="outline"
                  size="icon"
                  className="shrink-0 rounded-full"
                  onClick={handleShare}
                  title="Share this episode"
                >
                  <Share2 className="w-5 h-5" />
                </Button>
              </div>

              <div className="flex items-center gap-4 text-sm text-muted-foreground mb-6">
                <div className="flex items-center gap-1">
                  <Calendar className="w-4 h-4" />
                  <span>October 2024</span>
                </div>
                <Separator orientation="vertical" className="h-4" />
                <div className="font-medium text-primary">Tech &amp; Innovation</div>
              </div>

              <div className="prose prose-lg max-w-none text-muted-foreground">
                <p>{podcast.description}</p>
              </div>
            </div>
          </div>

          {/* Sidebar: Key Moments & About */}
          <div className="space-y-6">
            <Card className="p-6 sticky top-24">
              <h3 className="font-display font-bold text-xl mb-4">Key Moments</h3>
              <div className="space-y-4">
                {podcast.transcripts && podcast.transcripts.length > 0 ? (
                  podcast.transcripts.map((item, idx) => (
                    <div
                      key={idx}
                      className="group p-3 rounded-lg hover:bg-muted/50 transition-colors cursor-pointer border border-transparent hover:border-border/50"
                      onClick={() => seekTo(item.time)}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span className="font-semibold text-sm group-hover:text-primary transition-colors">
                          {item.topic}
                        </span>
                        <span className="text-xs font-mono bg-primary/10 text-primary px-2 py-0.5 rounded-full flex items-center gap-1">
                          <Play className="w-2 h-2 fill-current" /> {item.time}
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground line-clamp-2">{item.text}</p>
                    </div>
                  ))
                ) : (
                  <div className="text-sm text-muted-foreground italic text-center py-8">
                    No key moments available for this episode.
                  </div>
                )}
              </div>
            </Card>

            <Card className="p-6 bg-primary/5 border-primary/10">
              <h3 className="font-display font-bold text-lg mb-2">About the Show</h3>
              <p className="text-sm text-muted-foreground mb-4">
                MAKEIT.TECH explores the frontier of technology, design, and innovation. Join us as we interview the builders shaping the future.
              </p>
              <Link href="/subscribe">
                <Button className="w-full">Subscribe Now</Button>
              </Link>
            </Card>
          </div>
        </div>
      </div>
    </Layout>
  );
}
