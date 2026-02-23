import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@shared/routes";

// Support configurable API base URL (set VITE_API_URL in production)
const API_BASE = import.meta.env.VITE_API_URL ?? "";
const EPISODES_KEY = "/api/podcasts";

// GET /api/podcasts — list all episodes
export function useEpisodes() {
  return useQuery({
    queryKey: [EPISODES_KEY],
    queryFn: async () => {
      const res = await fetch(`${API_BASE}${EPISODES_KEY}`);
      if (!res.ok) throw new Error("Failed to fetch episodes");
      return res.json();
    },
  });
}

// GET /api/podcasts/:id — single episode
export function useEpisode(id) {
  return useQuery({
    queryKey: [EPISODES_KEY, id],
    queryFn: async () => {
      const res = await fetch(`${API_BASE}${EPISODES_KEY}/${id}`);
      if (res.status === 404) return null;
      if (!res.ok) throw new Error("Failed to fetch episode");
      return res.json();
    },
    enabled: !isNaN(id) && id > 0,
  });
}

// POST /api/ai/search — PCB search
export function usePCBSearch() {
  return useMutation({
    mutationFn: async (query) => {
      const res = await fetch(`${API_BASE}${api.ai.search.path}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query }),
      });
      if (!res.ok) throw new Error("PCB search failed");
      return res.json();
    },
  });
}

// POST /api/podcasts — create episode (backoffice)
export function useCreateEpisode() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data) => {
      const res = await fetch(`${API_BASE}${EPISODES_KEY}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ message: "Failed to create episode" }));
        throw new Error(err.message);
      }
      return res.json();
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: [EPISODES_KEY] }),
  });
}

// DELETE /api/podcasts/:id — delete episode (backoffice)
export function useDeleteEpisode() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id) => {
      const res = await fetch(`${API_BASE}${EPISODES_KEY}/${id}`, { method: "DELETE" });
      if (!res.ok && res.status !== 204) throw new Error("Failed to delete episode");
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: [EPISODES_KEY] }),
  });
}
