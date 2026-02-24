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

// POST /api/episodes/extract — YouTube auto-extraction (backoffice)
export function useExtractYouTube() {
  return useMutation({
    mutationFn: async ({ youtubeUrl, title, transcriptSource, transcriptText, analysisMode, aiProvider }) => {
      const res = await fetch(`${API_BASE}/api/episodes/extract`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ youtubeUrl, title, transcriptSource, transcriptText, analysisMode, aiProvider }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ message: "Extraction failed" }));
        throw new Error(err.message);
      }
      return res.json();
    },
  });
}

// GET /api/questions — AI-generated carousel questions (cached 10 min on frontend, 24h in DB)
const QUESTIONS_KEY = "/api/questions";

export function useQuestions() {
  return useQuery({
    queryKey: [QUESTIONS_KEY],
    queryFn: async () => {
      const res = await fetch(`${API_BASE}${QUESTIONS_KEY}`);
      if (!res.ok) throw new Error("Failed to fetch questions");
      return res.json();
    },
    staleTime: 10 * 60 * 1000,
  });
}

// PUT /api/podcasts/:id — update episode (backoffice)
export function useUpdateEpisode() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, data }) => {
      const res = await fetch(`${API_BASE}${EPISODES_KEY}/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ message: "Failed to update episode" }));
        throw new Error(err.message);
      }
      return res.json();
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: [EPISODES_KEY] }),
  });
}

// GET /api/settings — site visibility settings
const SETTINGS_KEY = "/api/settings";

export function useSettings() {
  return useQuery({
    queryKey: [SETTINGS_KEY],
    queryFn: async () => {
      const res = await fetch(`${API_BASE}${SETTINGS_KEY}`);
      if (!res.ok) throw new Error("Failed to fetch settings");
      return res.json();
    },
    staleTime: 30 * 1000,
  });
}

export function useUpdateSetting() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ key, value }) => {
      const res = await fetch(`${API_BASE}${SETTINGS_KEY}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key, value }),
      });
      if (!res.ok) throw new Error("Failed to update setting");
      return res.json();
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: [SETTINGS_KEY] }),
  });
}

// GET /api/featured-questions — AI-generated featured Q&A cards (cached 10 min on frontend, 24h in DB)
const FEATURED_KEY = "/api/featured-questions";

export function useFeaturedQuestions() {
  return useQuery({
    queryKey: [FEATURED_KEY],
    queryFn: async () => {
      const res = await fetch(`${API_BASE}${FEATURED_KEY}`);
      if (!res.ok) throw new Error("Failed to fetch featured questions");
      return res.json();
    },
    staleTime: 10 * 60 * 1000,
  });
}

// POST /api/subscribe — save subscriber email
export function useSubscribe() {
  return useMutation({
    mutationFn: async (email) => {
      const res = await fetch(`${API_BASE}/api/subscribe`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      if (!res.ok) throw new Error("Failed to subscribe");
      return res.json();
    },
  });
}

// POST /api/contact — contact form
export function useContact() {
  return useMutation({
    mutationFn: async (formData) => {
      const res = await fetch(`${API_BASE}/api/contact`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });
      if (!res.ok) throw new Error("Failed to send");
      return res.json();
    },
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
