import { z } from 'zod';
import { insertPodcastSchema, podcasts } from './schema';

export const errorSchemas = {
  validation: z.object({
    message: z.string(),
    field: z.string().optional(),
  }),
  notFound: z.object({
    message: z.string(),
  }),
  internal: z.object({
    message: z.string(),
  }),
};

export const api = {
  podcasts: {
    list: {
      method: 'GET' as const,
      path: '/api/podcasts' as const,
      responses: {
        200: z.array(z.custom<typeof podcasts.$inferSelect>()),
      },
    },
    get: {
      method: 'GET' as const,
      path: '/api/podcasts/:id' as const,
      responses: {
        200: z.custom<typeof podcasts.$inferSelect>(),
        404: errorSchemas.notFound,
      },
    },
  },
  ai: {
    search: {
      method: 'POST' as const,
      path: '/api/ai/search' as const,
      input: z.object({ query: z.string() }),
      responses: {
        200: z.object({
          podcastId: z.number().nullable(),
          timestamp: z.string().nullable(),
          explanation: z.string(),
        }),
        400: errorSchemas.internal,
        500: errorSchemas.internal,
      },
    },
  }
};

export function buildUrl(path: string, params?: Record<string, string | number>): string {
  let url = path;
  if (params) {
    Object.entries(params).forEach(([key, value]) => {
      if (url.includes(`:${key}`)) {
        url = url.replace(`:${key}`, String(value));
      }
    });
  }
  return url;
}
