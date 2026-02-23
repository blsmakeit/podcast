import { useState, useMemo } from "react";
import { useEpisodes } from "@/hooks/use-episodes";
import { Layout } from "@/components/Layout";
import { EpisodeCard } from "@/components/EpisodeCard";
import { AddEpisodeModal } from "@/components/backoffice/AddEpisodeModal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useBackoffice } from "@/components/backoffice/BackofficeContext";
import { motion } from "framer-motion";
import { Search, Plus, LayoutGrid, List } from "lucide-react";

const CATEGORIES = ["All", "Technology", "Hardware & PCB", "Design", "Business", "AI & Software", "Innovation", "Other"];

export default function Episodes() {
  const { data: episodes, isLoading } = useEpisodes();
  const { isAdmin } = useBackoffice();
  const [activeCategory, setActiveCategory] = useState("All");
  const [searchQuery, setSearchQuery] = useState("");
  const [showAddModal, setShowAddModal] = useState(false);

  const filtered = useMemo(() => {
    if (!episodes) return [];
    return episodes.filter((ep) => {
      const matchesCategory = activeCategory === "All" || ep.category === activeCategory;
      const q = searchQuery.toLowerCase();
      const matchesSearch = !q || ep.title.toLowerCase().includes(q) || ep.description.toLowerCase().includes(q);
      return matchesCategory && matchesSearch;
    });
  }, [episodes, activeCategory, searchQuery]);

  // Collect categories that actually have episodes
  const usedCategories = useMemo(() => {
    if (!episodes) return CATEGORIES;
    const cats = new Set(episodes.map((e) => e.category));
    return ["All", ...CATEGORIES.slice(1).filter((c) => cats.has(c))];
  }, [episodes]);

  return (
    <Layout>
      {/* Header */}
      <section className="relative pt-16 pb-10 overflow-hidden border-b bg-muted/20">
        <div className="absolute inset-0 -z-10 bg-[radial-gradient(ellipse_at_top_left,_var(--tw-gradient-stops))] from-primary/5 via-background to-background" />
        <div className="container mx-auto px-4">
          <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-6">
            <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}>
              <p className="text-sm font-semibold text-primary uppercase tracking-widest mb-2">Archive</p>
              <h1 className="font-display font-bold text-4xl md:text-5xl mb-2">All Episodes</h1>
              <p className="text-muted-foreground">
                {isLoading ? "Loading…" : `${episodes?.length ?? 0} episode${episodes?.length !== 1 ? "s" : ""} available`}
              </p>
            </motion.div>

            {isAdmin && (
              <Button onClick={() => setShowAddModal(true)} className="gap-2 shrink-0">
                <Plus className="w-4 h-4" /> Add Episode
              </Button>
            )}
          </div>

          {/* Search */}
          <div className="mt-6 relative max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Search episodes…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
            />
          </div>

          {/* Category filters */}
          <div className="mt-4 flex flex-wrap gap-2">
            {usedCategories.map((cat) => (
              <button
                key={cat}
                onClick={() => setActiveCategory(cat)}
                className={`px-4 py-1.5 rounded-full text-sm font-medium transition-all duration-200 border ${
                  activeCategory === cat
                    ? "bg-primary text-primary-foreground border-primary shadow-sm shadow-primary/30"
                    : "bg-background border-border text-muted-foreground hover:border-primary/50 hover:text-primary"
                }`}
              >
                {cat}
                {cat !== "All" && episodes && (
                  <span className="ml-1.5 opacity-60 text-xs">
                    ({episodes.filter((e) => e.category === cat).length})
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* Episodes grid */}
      <section className="py-12">
        <div className="container mx-auto px-4">
          {isLoading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
              {[1, 2, 3, 4, 5, 6].map((i) => (
                <div key={i} className="h-[360px] rounded-2xl bg-muted animate-pulse" />
              ))}
            </div>
          ) : filtered.length > 0 ? (
            <>
              {searchQuery || activeCategory !== "All" ? (
                <p className="text-sm text-muted-foreground mb-6">
                  Showing {filtered.length} result{filtered.length !== 1 ? "s" : ""}
                  {activeCategory !== "All" ? ` in "${activeCategory}"` : ""}
                  {searchQuery ? ` for "${searchQuery}"` : ""}
                </p>
              ) : null}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                {filtered.map((episode, i) => (
                  <EpisodeCard key={episode.id} podcast={episode} index={i} />
                ))}
              </div>
            </>
          ) : (
            <div className="text-center py-24">
              <p className="text-lg font-medium text-muted-foreground mb-2">No episodes found</p>
              <p className="text-sm text-muted-foreground mb-6">
                {searchQuery ? `No results for "${searchQuery}"` : `No episodes in this category yet.`}
              </p>
              {isAdmin && (
                <Button onClick={() => setShowAddModal(true)} className="gap-2">
                  <Plus className="w-4 h-4" /> Add Episode
                </Button>
              )}
            </div>
          )}
        </div>
      </section>

      <AddEpisodeModal open={showAddModal} onClose={() => setShowAddModal(false)} />
    </Layout>
  );
}
