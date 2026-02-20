import { Link } from "wouter";
import { Podcast } from "@shared/schema";
import { PlayCircle, Clock } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { motion } from "framer-motion";

interface PodcastCardProps {
  podcast: Podcast;
  index: number;
}

export function PodcastCard({ podcast, index }: PodcastCardProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: index * 0.1 }}
    >
      <Link href={`/podcasts/${podcast.id}`} className="block h-full">
        <Card className="h-full overflow-hidden border-0 bg-card shadow-lg hover:shadow-xl hover:-translate-y-1 transition-all duration-300 group cursor-pointer ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2">
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
    </motion.div>
  );
}
