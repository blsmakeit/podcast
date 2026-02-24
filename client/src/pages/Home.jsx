import { useState, useEffect } from "react";
import { useLocation, Link } from "wouter";
import { useEpisodes, usePCBSearch, useQuestions, useSettings, useUpdateSetting, useFeaturedQuestions } from "@/hooks/use-episodes";
import { Layout } from "@/components/Layout";
import { EpisodeCard } from "@/components/EpisodeCard";
import { AddEpisodeModal } from "@/components/backoffice/AddEpisodeModal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { useBackoffice } from "@/components/backoffice/BackofficeContext";
import { motion, AnimatePresence } from "framer-motion";
import { Search, ArrowRight, Loader2, Play, Plus, X } from "lucide-react";

function timeToSeconds(ts) {
  if (!ts) return 0;
  const parts = ts.split(":").map(Number);
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  return 0;
}

function ClockIcon({ className }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <circle cx="12" cy="12" r="10" />
      <polyline points="12 6 12 12 16 14" />
    </svg>
  );
}

// PCB circuit icon (simple SVG)
function PCBIcon({ className }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <rect x="2" y="2" width="20" height="20" rx="2" />
      <path d="M7 7h.01M17 7h.01M7 17h.01M17 17h.01" />
      <path d="M7 12h10M12 7v10" />
    </svg>
  );
}

export default function Home() {
  const { data: podcasts, isLoading } = useEpisodes();
  const { isAdmin } = useBackoffice();
  const [query, setQuery] = useState("");
  const { mutate: searchPCB, isPending: isSearching, data: pcbResult, reset } = usePCBSearch();
  const [, setLocation] = useLocation();
  const [showAddModal, setShowAddModal] = useState(false);

  // Questions carousel
  const { data: questionsData, isLoading: questionsLoading } = useQuestions();
  const questions = questionsData?.questions ?? [];
  const [activeQ, setActiveQ] = useState(0);
  const [fading, setFading] = useState(false);
  const [paused, setPaused] = useState(false);

  // Settings & featured questions
  const { data: settingsData } = useSettings();
  const { data: featuredData } = useFeaturedQuestions();
  const { mutate: updateSetting } = useUpdateSetting();
  const showCarousel = settingsData?.show_carousel ?? true;
  const showFeatured = settingsData?.show_featured_questions ?? false;

  useEffect(() => {
    if (questions.length === 0 || paused) return;
    const timer = setInterval(() => {
      setFading(true);
      setTimeout(() => {
        setActiveQ(prev => (prev + 1) % questions.length);
        setFading(false);
      }, 300);
    }, 6000);
    return () => clearInterval(timer);
  }, [questions.length, paused]);

  const goTo = (i) => {
    setFading(true);
    setTimeout(() => { setActiveQ(i); setFading(false); }, 300);
  };

  const handleSearch = (e) => {
    e.preventDefault();
    if (!query.trim()) return;
    searchPCB(query);
  };

  const handlePlayResult = () => {
    if (pcbResult?.podcastId && pcbResult?.timestamp) {
      const seconds = timeToSeconds(pcbResult.timestamp);
      setLocation(`/podcasts/${pcbResult.podcastId}?t=${seconds}`);
    }
  };

  return (
    <Layout>
      {/* Hero Section */}
      <section className="relative pt-20 pb-32 overflow-hidden">
        {/* Background */}
        <div className="absolute inset-0 -z-10 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-primary/5 via-background to-background" />
        <div className="absolute top-0 right-0 -mr-20 -mt-20 w-96 h-96 bg-primary/10 rounded-full blur-3xl opacity-50" />
        <div className="absolute bottom-0 left-0 -ml-20 -mb-20 w-72 h-72 bg-blue-500/10 rounded-full blur-3xl opacity-50" />

        <div className="container mx-auto px-4 max-w-4xl text-center">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
          >
            {/* Show name */}
            <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-4">MAKEIT.TECH presents</p>
            <h1 className="font-display font-black text-6xl md:text-8xl mb-4 tracking-tight leading-[1]">
              MAKEIT<br /><span className="text-gradient">OR BREAKIT</span>
            </h1>
            <p className="text-xl text-muted-foreground mb-8 max-w-2xl mx-auto leading-relaxed">
              The show where founders, engineers and builders share what it really takes — or what breaks you.
            </p>

            {/* PCB badge + label */}
            <span className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-primary/10 text-primary text-sm font-semibold mb-3">
              <PCBIcon className="w-4 h-4" />
              PCB — Podcast Content Browser
            </span>
            <p className="text-sm text-muted-foreground mb-4">
              Search inside <strong className="text-foreground">MAKEIT OR BREAKIT</strong> episodes
            </p>

            {/* PCB Search Bar */}
            <div className="relative max-w-2xl mx-auto mb-6 group">
              <div className="absolute -inset-1 bg-gradient-to-r from-primary to-red-400 rounded-xl blur opacity-20 group-hover:opacity-40 transition duration-1000 group-hover:duration-200" />
              <form onSubmit={handleSearch} className="relative flex items-center bg-card rounded-xl p-2 shadow-xl border border-border/50">
                <Search className="w-5 h-5 text-muted-foreground ml-3 shrink-0" />
                <Input
                  className="flex-1 border-0 shadow-none focus-visible:ring-0 bg-transparent text-lg placeholder:text-muted-foreground/50 h-12"
                  placeholder="Ask PCB anything — topic, keyword, question…"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  disabled={isSearching}
                />
                <Button
                  size="lg"
                  type="submit"
                  disabled={isSearching || !query.trim()}
                  className="rounded-lg px-8 font-semibold shadow-lg shadow-primary/20 shrink-0"
                >
                  {isSearching ? <Loader2 className="w-5 h-5 animate-spin" /> : "Ask PCB"}
                </Button>
              </form>
            </div>

            {/* Admin visibility panel */}
            {isAdmin && (
              <div className="w-full max-w-5xl mx-auto mb-4 p-4 bg-gray-50 border border-gray-200 rounded-xl flex items-center gap-6">
                <span className="text-sm font-medium text-gray-600">Section visibility:</span>

                <label className="flex items-center gap-2 cursor-pointer">
                  <div
                    onClick={() => updateSetting({ key: "show_carousel", value: !showCarousel })}
                    className={`w-10 h-6 rounded-full transition-colors ${showCarousel ? "bg-green-500" : "bg-gray-300"} relative`}
                  >
                    <div className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow transition-transform ${showCarousel ? "translate-x-5" : "translate-x-1"}`} />
                  </div>
                  <span className="text-sm text-gray-700">Questions Carousel</span>
                </label>

                <label className="flex items-center gap-2 cursor-pointer">
                  <div
                    onClick={() => updateSetting({ key: "show_featured_questions", value: !showFeatured })}
                    className={`w-10 h-6 rounded-full transition-colors ${showFeatured ? "bg-green-500" : "bg-gray-300"} relative`}
                  >
                    <div className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow transition-transform ${showFeatured ? "translate-x-5" : "translate-x-1"}`} />
                  </div>
                  <span className="text-sm text-gray-700">Featured Q&A Cards</span>
                </label>

                <span className="text-xs text-gray-400 ml-auto">Only visible to admins</span>
              </div>
            )}

            {/* Questions Carousel */}
            {showCarousel && (
              <div
                className="w-full max-w-3xl mx-auto mt-4 mb-10 rounded-2xl p-6 text-white shadow-xl"
                style={{ background: "linear-gradient(135deg, #1a0505 0%, #0f0f0f 100%)", borderLeft: "3px solid #dc2626" }}
                onMouseEnter={() => setPaused(true)}
                onMouseLeave={() => setPaused(false)}
              >
                <p className="text-xs uppercase mb-4 text-center" style={{ color: "#dc2626", letterSpacing: "0.15em" }}>
                  Questions explored in MAKEIT OR BREAKIT
                </p>
                {questionsLoading ? (
                  <div className="h-16 bg-gray-700 rounded-lg animate-pulse" />
                ) : questions.length > 0 ? (
                  <>
                    <div className="group relative min-h-[4rem] flex items-center justify-center">
                      <p
                        title="Click to search this topic"
                        className="text-xl cursor-pointer hover:underline text-center leading-snug"
                        style={{ opacity: fading ? 0 : 1, color: "#f5f5f5", transition: "opacity 0.3s ease" }}
                        onClick={() => { setQuery(questions[activeQ]); searchPCB(questions[activeQ]); }}
                      >
                        {questions[activeQ]}
                      </p>
                      <span className="absolute -bottom-6 left-1/2 -translate-x-1/2 text-xs text-red-400 opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap">
                        🔍 Ask PCB
                      </span>
                    </div>

                    <div className="flex justify-center gap-2 mt-8">
                      {questions.map((_, i) => (
                        <button
                          key={i}
                          onClick={() => goTo(i)}
                          style={{
                            width: i === activeQ ? "12px" : "8px",
                            height: i === activeQ ? "12px" : "8px",
                            backgroundColor: i === activeQ ? "#dc2626" : "#4b4b4b",
                            borderRadius: "50%",
                            transition: "all 0.2s",
                            border: "none",
                            cursor: "pointer",
                            padding: 0,
                          }}
                        />
                      ))}
                    </div>

                    <div className="flex items-center justify-between mt-4">
                      <button
                        onClick={() => goTo((activeQ - 1 + questions.length) % questions.length)}
                        style={{ width: "36px", height: "36px", borderRadius: "50%", background: "#1f1f1f", border: "none", color: "#9ca3af", fontSize: "1.25rem", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", transition: "background 0.2s" }}
                        onMouseEnter={e => e.currentTarget.style.background = "#7f1d1d"}
                        onMouseLeave={e => e.currentTarget.style.background = "#1f1f1f"}
                      >
                        ‹
                      </button>
                      <span style={{ color: "#9ca3af", fontSize: "0.75rem" }}>
                        {activeQ + 1} / {questions.length}
                      </span>
                      <button
                        onClick={() => goTo((activeQ + 1) % questions.length)}
                        style={{ width: "36px", height: "36px", borderRadius: "50%", background: "#1f1f1f", border: "none", color: "#9ca3af", fontSize: "1.25rem", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", transition: "background 0.2s" }}
                        onMouseEnter={e => e.currentTarget.style.background = "#7f1d1d"}
                        onMouseLeave={e => e.currentTarget.style.background = "#1f1f1f"}
                      >
                        ›
                      </button>
                    </div>
                  </>
                ) : null}
              </div>
            )}

            {/* Featured Questions Section */}
            {showFeatured && (
              <div className="w-full max-w-5xl mx-auto mt-6 mb-10">
                <h2 className="text-2xl font-bold text-center mb-6">Questions worth exploring</h2>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {(featuredData?.items ?? []).map((item, i) => (
                    <div key={i} className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm flex flex-col gap-3">
                      <p className="font-semibold text-gray-900 text-base">{item.question}</p>
                      <p className="text-gray-500 text-sm flex-1">{item.answer}</p>
                      <button
                        onClick={() => {
                          const secs = timeToSeconds(item.timestamp);
                          setLocation(`/podcasts/${item.podcastId}?t=${secs}`);
                        }}
                        className="flex items-center gap-2 bg-red-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-red-700 transition self-start"
                      >
                        <Play className="w-3 h-3 fill-current" /> Play Segment
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* PCB Result Card */}
            <AnimatePresence>
              {pcbResult && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.95, y: 10 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  className="max-w-2xl mx-auto"
                >
                  <Card className="text-left p-6 border-primary/20 bg-primary/5 relative overflow-hidden">
                    <button
                      onClick={reset}
                      className="absolute top-4 right-4 text-muted-foreground hover:text-foreground transition-colors"
                      aria-label="Close result"
                    >
                      <X className="w-4 h-4" />
                    </button>
                    <div className="flex flex-col sm:flex-row gap-6 items-start">
                      <div className="flex-1">
                        <h3 className="font-display font-bold text-lg mb-2 flex items-center gap-2">
                          <PCBIcon className="w-4 h-4 text-primary" />
                          PCB Found a Match
                        </h3>
                        <p className="text-muted-foreground mb-4">"{pcbResult.explanation}"</p>
                        {pcbResult.timestamp && (
                          <div className="inline-flex items-center gap-2 text-sm font-medium bg-background/50 px-3 py-1 rounded-md border border-border/50">
                            <ClockIcon className="w-4 h-4 text-primary" />
                            Timestamp: <span className="font-mono text-primary">{pcbResult.timestamp}</span>
                          </div>
                        )}
                      </div>
                      {pcbResult.podcastId && (
                        <Button onClick={handlePlayResult} className="shrink-0 w-full sm:w-auto mt-2 sm:mt-0 gap-2 shadow-lg">
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
            <div className="hidden sm:flex items-center gap-3">
              {isAdmin && (
                <Button
                  onClick={() => setShowAddModal(true)}
                  className="gap-2"
                >
                  <Plus className="w-4 h-4" />
                  Add Episode
                </Button>
              )}
              <Link href="/episodes">
                <Button variant="ghost" className="group gap-2 text-primary hover:text-primary hover:bg-primary/10">
                  View All <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-1" />
                </Button>
              </Link>
            </div>
          </div>

          {isLoading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-[400px] rounded-2xl bg-muted animate-pulse" />
              ))}
            </div>
          ) : podcasts && podcasts.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
              {podcasts.map((podcast, i) => (
                <EpisodeCard key={podcast.id} podcast={podcast} index={i} />
              ))}
            </div>
          ) : (
            <div className="text-center py-20 text-muted-foreground">
              <p className="text-lg mb-2">No episodes yet.</p>
              {isAdmin && (
                <Button onClick={() => setShowAddModal(true)} className="mt-4 gap-2">
                  <Plus className="w-4 h-4" /> Add First Episode
                </Button>
              )}
            </div>
          )}

          {/* Mobile controls */}
          <div className="mt-12 sm:hidden flex flex-col gap-3">
            {isAdmin && (
              <Button onClick={() => setShowAddModal(true)} className="w-full gap-2">
                <Plus className="w-4 h-4" /> Add Episode
              </Button>
            )}
            <Link href="/episodes">
              <Button variant="outline" className="w-full">View All Episodes</Button>
            </Link>
          </div>
        </div>
      </section>

      <AddEpisodeModal open={showAddModal} onClose={() => setShowAddModal(false)} />
    </Layout>
  );
}
