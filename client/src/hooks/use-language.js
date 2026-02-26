import { createContext, useContext, useState, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { translations as staticTranslations } from '@/lib/translations';

const LanguageContext = createContext(null);
const API_BASE = import.meta.env.VITE_API_URL || '';

export function LanguageProvider({ children }) {
  const [lang, setLangState] = useState(() => {
    try { return localStorage.getItem('lang') || 'en'; } catch { return 'en'; }
  });

  // Fetch from DB — static translations used instantly as fallback while loading
  const { data: dbTranslations = {} } = useQuery({
    queryKey: ['translations', lang],
    queryFn: async () => {
      const res = await fetch(`${API_BASE}/api/translations/${lang}`);
      if (!res.ok) return {};
      return res.json();
    },
    staleTime: 1000 * 60 * 60, // cache for 1 hour
  });

  const setLang = useCallback((l) => {
    setLangState(l);
    try { localStorage.setItem('lang', l); } catch {}
  }, []);

  // DB values take precedence; static file is the instant fallback
  const t = useCallback((key, fallback) => {
    return (
      dbTranslations[key] ||
      staticTranslations[lang]?.[key] ||
      staticTranslations.en?.[key] ||
      fallback ||
      key
    );
  }, [lang, dbTranslations]);

  return (
    <LanguageContext.Provider value={{ lang, setLang, t }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  const ctx = useContext(LanguageContext);
  if (!ctx) throw new Error('useLanguage must be used within LanguageProvider');
  return ctx;
}
