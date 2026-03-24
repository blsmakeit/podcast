import { useState } from "react";
import { Link, useLocation } from "wouter";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { Menu, Lock, Unlock, Settings, Share2 } from "lucide-react";
import { useBackoffice } from "@/components/backoffice/BackofficeContext";
import { useLanguage } from "@/hooks/use-language";
import { useQuery } from "@tanstack/react-query";

const API_BASE = import.meta.env.VITE_API_URL ?? "";

function LangToggle({ lang, setLang, className }) {
  return (
    <div className={cn("flex items-center border border-border rounded-full overflow-hidden text-xs font-semibold", className)}>
      <button
        onClick={() => setLang('en')}
        className={cn(
          "px-3 py-1.5 transition-colors",
          lang === 'en' ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
        )}
      >
        EN
      </button>
      <button
        onClick={() => setLang('pt')}
        className={cn(
          "px-3 py-1.5 transition-colors",
          lang === 'pt' ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
        )}
      >
        PT
      </button>
    </div>
  );
}

export function Layout({ children }) {
  const [location] = useLocation();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const { isAdmin, openLogin, logout } = useBackoffice();
  const { lang, setLang, t } = useLanguage();

  const { data: unprocessedData } = useQuery({
    queryKey: ['/api/social-media/unprocessed-count'],
    queryFn: async () => {
      const res = await fetch(`${API_BASE}/api/social-media/unprocessed-count`);
      if (!res.ok) return { count: 0 };
      const json = await res.json();
      return json.data ?? { count: 0 };
    },
    enabled: isAdmin,
    refetchInterval: 30000,
  });
  const unprocessedCount = unprocessedData?.count ?? 0;

  const navItems = [
    { label: t('nav.home'), href: "/" },
    { label: t('nav.episodes'), href: "/episodes" },
    { label: t('nav.about'), href: "/about" },
  ];

  return (
    <div className="min-h-screen flex flex-col bg-background font-body">
      {/* Admin banner */}
      {isAdmin && (
        <div className="bg-primary text-primary-foreground py-2 px-4 text-sm font-semibold flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Settings className="w-4 h-4 animate-spin-slow shrink-0" />
            <span>{t('admin.banner')}</span>
          </div>
          <div className="flex items-center gap-4">
            <Link
              href="/admin/social-media"
              className="flex items-center gap-1.5 hover:opacity-80 transition-opacity relative"
            >
              <Share2 className="w-4 h-4" />
              <span>Social Media</span>
              {unprocessedCount > 0 && (
                <span className="absolute -top-2 -right-3 bg-white text-primary text-[10px] font-bold rounded-full w-4 h-4 flex items-center justify-center leading-none">
                  {unprocessedCount > 9 ? "9+" : unprocessedCount}
                </span>
              )}
            </Link>
            <button
              onClick={logout}
              className="underline underline-offset-2 hover:opacity-80 transition-opacity"
            >
              {t('admin.exit')}
            </button>
          </div>
        </div>
      )}

      <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container mx-auto px-4 h-16 flex items-center justify-between">
          <Link href="/" className="flex items-center group">
            <img
              src="/logo.png"
              alt="MAKEIT.TECH"
              className="h-8 w-auto"
            />
          </Link>

          {/* Desktop Nav */}
          <nav className="hidden md:flex items-center gap-6">
            {navItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "text-sm font-medium transition-colors hover:text-primary",
                  location === item.href ? "text-primary" : "text-muted-foreground"
                )}
              >
                {item.label}
              </Link>
            ))}
            <Link href="/subscribe">
              <Button size="sm" className="font-semibold shadow-lg shadow-primary/20">
                {t('nav.subscribe')}
              </Button>
            </Link>
            <LangToggle lang={lang} setLang={setLang} />
          </nav>

          {/* Mobile Nav */}
          <div className="md:hidden flex items-center gap-2">
            <LangToggle lang={lang} setLang={setLang} />
            <Sheet open={isMobileMenuOpen} onOpenChange={setIsMobileMenuOpen}>
              <SheetTrigger asChild>
                <Button variant="ghost" size="icon">
                  <Menu className="h-5 w-5" />
                </Button>
              </SheetTrigger>
              <SheetContent side="right">
                <div className="flex flex-col gap-4 mt-8">
                  {navItems.map((item) => (
                    <Link
                      key={item.href}
                      href={item.href}
                      className={cn(
                        "text-lg font-medium transition-colors hover:text-primary",
                        location === item.href ? "text-primary" : "text-muted-foreground"
                      )}
                      onClick={() => setIsMobileMenuOpen(false)}
                    >
                      {item.label}
                    </Link>
                  ))}
                  <Link href="/subscribe">
                    <Button className="w-full mt-4" onClick={() => setIsMobileMenuOpen(false)}>
                      {t('nav.subscribe')}
                    </Button>
                  </Link>
                </div>
              </SheetContent>
            </Sheet>
          </div>
        </div>
      </header>

      <main className="flex-1">
        {children}
      </main>

      <footer className="border-t py-12 bg-muted/30">
        <div className="container mx-auto px-4 grid grid-cols-1 md:grid-cols-4 gap-8">
          <div className="space-y-4">
            <img src="/logo.png" alt="MAKEIT.TECH" className="h-7 w-auto" />
            <p className="text-sm text-muted-foreground">
              {t('footer.tagline')}
            </p>
          </div>
          <div>
            <h4 className="font-display font-bold mb-4">{t('footer.platform')}</h4>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li><Link href="/episodes" className="hover:text-primary transition-colors">{t('footer.episodes')}</Link></li>
              <li><Link href="/series" className="hover:text-primary transition-colors">{t('footer.series')}</Link></li>
              <li><Link href="/hosts" className="hover:text-primary transition-colors">{t('footer.hosts')}</Link></li>
            </ul>
          </div>
          <div>
            <h4 className="font-display font-bold mb-4">{t('footer.company')}</h4>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li><Link href="/about" className="hover:text-primary transition-colors">{t('footer.about')}</Link></li>
              <li><Link href="/careers" className="hover:text-primary transition-colors">{t('footer.careers')}</Link></li>
              <li><Link href="/contact" className="hover:text-primary transition-colors">{t('footer.contact')}</Link></li>
            </ul>
          </div>
          <div>
            <h4 className="font-display font-bold mb-4">{t('footer.legal')}</h4>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li><Link href="/privacy" className="hover:text-primary transition-colors">{t('footer.privacy')}</Link></li>
              <li><Link href="/terms" className="hover:text-primary transition-colors">{t('footer.terms')}</Link></li>
            </ul>
          </div>
        </div>

        <div className="container mx-auto px-4 mt-12 pt-8 border-t flex flex-col sm:flex-row items-center justify-between gap-4 relative">
          <p className="text-xs text-muted-foreground">
            {t('footer.copyright').replace('{year}', new Date().getFullYear())}
          </p>
          {/* Subtle admin toggle — centrado na linha */}
          <button
            onClick={isAdmin ? logout : openLogin}
            className="flex items-center gap-1.5 text-xs text-muted-foreground/40 hover:text-muted-foreground transition-colors sm:absolute sm:left-1/2 sm:-translate-x-1/2"
            title={isAdmin ? t('admin.toggle_exit') : t('admin.toggle_enter')}
          >
            {isAdmin ? <Unlock className="w-3 h-3" /> : <Lock className="w-3 h-3" />}
            {isAdmin ? t('admin.toggle_exit') : t('admin.toggle_enter')}
          </button>
        </div>
      </footer>
    </div>
  );
}
