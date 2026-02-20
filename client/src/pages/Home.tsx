import { useState } from "react";
import { useLocation, Link } from "wouter";
import { usePodcasts, useAISearch } from "@/hooks/use-podcasts";
import { Layout } from "@/components/Layout";
import { PodcastCard } from "@/components/PodcastCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sparkles, Search, ArrowRight, Loader2, Play } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { Card } from "@/components/ui/card";

export default function Home() {
  const { data: podcasts, isLoading } = usePodcasts();
  const [query, setQuery] = useState("");
  const { mutate: searchAI, isPending: isSearching, data: aiResult, reset } = useAISearch();
  const [, setLocation] = useLocation();

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim()) return;
    searchAI(query);
  };

  const handlePlayAIResult = () => {
    if (aiResult?.podcastId && aiResult?.timestamp) {
      setLocation(`/podcasts/${aiResult.podcastId}?t=${aiResult.timestamp}`);
    }
  };

  return (
    <Layout>
      {/* Hero Section */}
      <section className="relative pt-20 pb-32 overflow-hidden">
        {/* Background Elements */}
        <div className="absolute inset-0 -z-10 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-primary/5 via-background to-background" />
        <div className="absolute top-0 right-0 -mr-20 -mt-20 w-96 h-96 bg-primary/10 rounded-full blur-3xl opacity-50" />
        <div className="absolute bottom-0 left-0 -ml-20 -mb-20 w-72 h-72 bg-blue-500/10 rounded-full blur-3xl opacity-50" />

        <div className="container mx-auto px-4 max-w-4xl text-center">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
          >
            <span className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-primary/10 text-primary text-sm font-semibold mb-6">
              <Sparkles className="w-4 h-4" />
              New Feature: AI Search
            </span>
            <h1 className="font-display font-bold text-5xl md:text-7xl mb-6 tracking-tight leading-[1.1]">
              Find the <span className="text-gradient">exact moment</span><br />that matters.
            </h1>
            <p className="text-xl text-muted-foreground mb-10 max-w-2xl mx-auto leading-relaxed">
              Don't waste time scrubbing through hours of content. Just ask our AI what you're looking for, and we'll take you right there.
            </p>

            <div className="relative max-w-2xl mx-auto mb-12 group">
              <div className="absolute -inset-1 bg-gradient-to-r from-primary to-blue-600 rounded-xl blur opacity-20 group-hover:opacity-40 transition duration-1000 group-hover:duration-200"></div>
              <form onSubmit={handleSearch} className="relative flex items-center bg-card rounded-xl p-2 shadow-xl border border-border/50">
                <Search className="w-5 h-5 text-muted-foreground ml-3" />
                <Input 
                  className="flex-1 border-0 shadow-none focus-visible:ring-0 bg-transparent text-lg placeholder:text-muted-foreground/50 h-12"
                  placeholder="Ask a question or topic (e.g., 'When do they discuss AI ethics?')"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  disabled={isSearching}
                />
                <Button 
                  size="lg" 
                  type="submit" 
                  disabled={isSearching || !query.trim()}
                  className="rounded-lg px-8 font-semibold shadow-lg shadow-primary/20"
                >
                  {isSearching ? <Loader2 className="w-5 h-5 animate-spin" /> : "Find It"}
                </Button>
              </form>
            </div>

            {/* AI Result Card */}
            <AnimatePresence>
              {aiResult && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.95, y: 10 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  className="max-w-2xl mx-auto"
                >
                  <Card className="text-left p-6 border-primary/20 bg-primary/5 relative overflow-hidden">
                    <div className="absolute top-0 right-0 p-4">
                      <Button variant="ghost" size="icon" onClick={() => reset()} className="h-6 w-6 rounded-full hover:bg-primary/10">
                        <span className="sr-only">Close</span>
                        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
                      </Button>
                    </div>
                    <div className="flex flex-col sm:flex-row gap-6 items-start">
                      <div className="flex-1">
                        <h3 className="font-display font-bold text-lg mb-2 flex items-center gap-2">
                          <Sparkles className="w-4 h-4 text-primary" />
                          AI Found a Match
                        </h3>
                        <p className="text-muted-foreground mb-4">
                          "{aiResult.explanation}"
                        </p>
                        {aiResult.timestamp && (
                          <div className="inline-flex items-center gap-2 text-sm font-medium bg-background/50 px-3 py-1 rounded-md border border-border/50">
                            <ClockIcon className="w-4 h-4 text-primary" />
                            Timestamp: {aiResult.timestamp}
                          </div>
                        )}
                      </div>
                      {aiResult.podcastId && (
                        <Button onClick={handlePlayAIResult} className="shrink-0 w-full sm:w-auto mt-2 sm:mt-0 gap-2 shadow-lg">
                          <Play className="w-4 h-4 fill-current" />
                          Play Segment
                        </Button>
                      )}
                    </div>
                  </Card>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        </div>
      </section>

      {/* Latest Episodes */}
      <section className="py-20 bg-muted/30">
        <div className="container mx-auto px-4">
          <div className="flex items-end justify-between mb-12">
            <div>
              <h2 className="font-display font-bold text-3xl md:text-4xl mb-3">Latest Episodes</h2>
              <p className="text-muted-foreground text-lg">Fresh insights from industry leaders.</p>
            </div>
            <Link href="/episodes">
              <Button variant="ghost" className="hidden sm:flex group gap-2 text-primary hover:text-primary hover:bg-primary/10">
                View All <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-1" />
              </Button>
            </Link>
          </div>

          {isLoading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-[400px] rounded-2xl bg-muted animate-pulse" />
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
              {podcasts?.map((podcast, i) => (
                <PodcastCard key={podcast.id} podcast={podcast} index={i} />
              ))}
            </div>
          )}

          <div className="mt-12 text-center sm:hidden">
            <Link href="/episodes">
              <Button variant="outline" className="w-full">View All Episodes</Button>
            </Link>
          </div>
        </div>
      </section>
    </Layout>
  );
}

function ClockIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <circle cx="12" cy="12" r="10"/>
      <polyline points="12 6 12 12 16 14"/>
    </svg>
  );
}
