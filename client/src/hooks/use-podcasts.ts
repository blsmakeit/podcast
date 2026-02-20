import { useQuery, useMutation } from "@tanstack/react-query";
import { api, buildUrl } from "@shared/routes";

// GET /api/podcasts
export function usePodcasts() {
  return useQuery({
    queryKey: [api.podcasts.list.path],
    queryFn: async () => {
      const res = await fetch(api.podcasts.list.path);
      if (!res.ok) throw new Error("Failed to fetch podcasts");
      return api.podcasts.list.responses[200].parse(await res.json());
    },
  });
}

// GET /api/podcasts/:id
export function usePodcast(id: number) {
  return useQuery({
    queryKey: [api.podcasts.get.path, id],
    queryFn: async () => {
      const url = buildUrl(api.podcasts.get.path, { id });
      const res = await fetch(url);
      if (res.status === 404) return null;
      if (!res.ok) throw new Error("Failed to fetch podcast");
      return api.podcasts.get.responses[200].parse(await res.json());
    },
    enabled: !isNaN(id),
  });
}

// POST /api/ai/search
export function useAISearch() {
  return useMutation({
    mutationFn: async (query: string) => {
      const res = await fetch(api.ai.search.path, {
        method: api.ai.search.method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query }),
      });
      
      if (!res.ok) {
        throw new Error("AI Search failed");
      }
      
      return api.ai.search.responses[200].parse(await res.json());
    },
  });
}
