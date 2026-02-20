import { useEffect, useRef } from "react";
import { useParams, useLocation } from "wouter";
import { usePodcast } from "@/hooks/use-podcasts";
import { Layout } from "@/components/Layout";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Loader2, Calendar, Share2, ArrowLeft, Play } from "lucide-react";
import { Link } from "wouter";

export default function PodcastDetail() {
  const { id } = useParams<{ id: string }>();
  const [location] = useLocation();
  const { data: podcast, isLoading, error } = usePodcast(Number(id));
  const videoRef = useRef<HTMLVideoElement>(null);

  // Parse timestamp from URL query param (e.g. ?t=01:30)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const timestamp = params.get('t');

    if (timestamp && videoRef.current) {
      const [minutes, seconds] = timestamp.split(':').map(Number);
      if (!isNaN(minutes) && !isNaN(seconds)) {
        const totalSeconds = minutes * 60 + seconds;
        videoRef.current.currentTime = totalSeconds;
        videoRef.current.play().catch(() => {
          // Auto-play might be blocked, that's okay
          console.log("Autoplay blocked, waiting for user interaction");
        });
      }
    }
  }, [location, isLoading]);

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
          {/* Main Content: Video & Details */}
          <div className="lg:col-span-2 space-y-8">
            <div className="relative rounded-2xl overflow-hidden shadow-2xl bg-black aspect-video group">
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
                <Button variant="outline" size="icon" className="shrink-0 rounded-full">
                  <Share2 className="w-5 h-5" />
                </Button>
              </div>

              <div className="flex items-center gap-4 text-sm text-muted-foreground mb-6">
                <div className="flex items-center gap-1">
                  <Calendar className="w-4 h-4" />
                  <span>October 24, 2024</span>
                </div>
                <Separator orientation="vertical" className="h-4" />
                <div className="font-medium text-primary">Tech & AI</div>
              </div>

              <div className="prose prose-lg max-w-none text-muted-foreground">
                <p>{podcast.description}</p>
              </div>
            </div>
          </div>

          {/* Sidebar: Transcripts & AI Topics */}
          <div className="space-y-6">
            <Card className="p-6 sticky top-24">
              <h3 className="font-display font-bold text-xl mb-4">Key Moments</h3>
              <div className="space-y-4">
                {podcast.transcripts && podcast.transcripts.length > 0 ? (
                  (podcast.transcripts as Array<{time: string, topic: string, text: string}>).map((item, idx) => (
                    <div 
                      key={idx} 
                      className="group p-3 rounded-lg hover:bg-muted/50 transition-colors cursor-pointer border border-transparent hover:border-border/50"
                      onClick={() => {
                        if (videoRef.current) {
                          const [m, s] = item.time.split(':').map(Number);
                          videoRef.current.currentTime = m * 60 + s;
                          videoRef.current.play();
                        }
                      }}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span className="font-semibold text-sm group-hover:text-primary transition-colors">{item.topic}</span>
                        <span className="text-xs font-mono bg-primary/10 text-primary px-2 py-0.5 rounded-full flex items-center gap-1">
                          <Play className="w-2 h-2 fill-current" /> {item.time}
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground line-clamp-2">
                        {item.text}
                      </p>
                    </div>
                  ))
                ) : (
                  <div className="text-sm text-muted-foreground italic text-center py-8">
                    No transcript markers available for this episode.
                  </div>
                )}
              </div>
            </Card>

            <Card className="p-6 bg-primary/5 border-primary/10">
              <h3 className="font-display font-bold text-lg mb-2">About the Show</h3>
              <p className="text-sm text-muted-foreground mb-4">
                MAKEIT.TECH explores the frontier of technology, design, and innovation. Join us as we interview the builders shaping the future.
              </p>
              <Button className="w-full">Subscribe Now</Button>
            </Card>
          </div>
        </div>
      </div>
    </Layout>
  );
}
