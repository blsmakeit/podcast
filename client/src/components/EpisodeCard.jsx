import { useState } from "react";
import { Link } from "wouter";
import { PlayCircle, Clock, Pencil, Tag } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { motion } from "framer-motion";
import { useBackoffice } from "@/components/backoffice/BackofficeContext";
import { AddEpisodeModal } from "@/components/backoffice/AddEpisodeModal";

export function EpisodeCard({ podcast, index }) {
  const { isAdmin } = useBackoffice();
  const [editing, setEditing] = useState(false);

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: index * 0.1 }}
      className="relative"
    >
      {isAdmin && (
        <Button
          variant="secondary"
          size="sm"
          onClick={(e) => { e.preventDefault(); e.stopPropagation(); setEditing(true); }}
          className="absolute top-3 right-3 z-20 gap-1.5 shadow-lg"
        >
          <Pencil className="w-3.5 h-3.5" />
          Edit
        </Button>
      )}

      <Link href={`/podcasts/${podcast.id}`} className="block h-full">
        <Card className="h-full overflow-hidden border-0 bg-card shadow-lg hover:shadow-xl hover:-translate-y-1 transition-all duration-300 group cursor-pointer">
          <div className="relative aspect-video overflow-hidden">
            <img
              src={podcast.thumbnailUrl}
              alt={podcast.title}
              className="object-cover w-full h-full transition-transform duration-500 group-hover:scale-105"
            />
            <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex items-center justify-center backdrop-blur-[2px]">
              <div className="bg-white/20 backdrop-blur-sm p-4 rounded-full border border-white/40 shadow-xl">
                <PlayCircle className="w-10 h-10 text-white fill-white/20" />
              </div>
            </div>
            {podcast.category && (
              <div className="absolute bottom-2 left-2">
                <span className="inline-flex items-center gap-1 text-xs font-medium bg-black/60 text-white px-2 py-0.5 rounded-full backdrop-blur-sm">
                  <Tag className="w-2.5 h-2.5" /> {podcast.category}
                </span>
              </div>
            )}
          </div>
          <CardContent className="p-5">
            <div className="flex items-center gap-2 text-xs text-muted-foreground mb-3 font-medium uppercase tracking-wider">
              <span className="bg-primary/10 text-primary px-2 py-0.5 rounded-full">Episode {podcast.id}</span>
              <span className="flex items-center gap-1"><Clock className="w-3 h-3" /> 45 min</span>
            </div>
            <h3 className="font-display font-bold text-lg leading-tight mb-2 group-hover:text-primary transition-colors line-clamp-2">
              {podcast.title}
            </h3>
            <p className="text-sm text-muted-foreground line-clamp-3">
              {podcast.description}
            </p>
          </CardContent>
        </Card>
      </Link>

      {editing && (
        <AddEpisodeModal
          open={editing}
          onClose={() => setEditing(false)}
          episodeId={podcast.id}
          initialData={podcast}
        />
      )}
    </motion.div>
  );
}
