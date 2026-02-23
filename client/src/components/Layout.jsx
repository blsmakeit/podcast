import { useState } from "react";
import { Link, useLocation } from "wouter";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { Menu, Lock, Unlock, Settings } from "lucide-react";
import { useBackoffice } from "@/components/backoffice/BackofficeContext";

export function Layout({ children }) {
  const [location] = useLocation();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const { isAdmin, openLogin, logout } = useBackoffice();

  const navItems = [
    { label: "Home", href: "/" },
    { label: "Episodes", href: "/episodes" },
    { label: "About", href: "/about" },
  ];

  return (
    <div className="min-h-screen flex flex-col bg-background font-body">
      {/* Admin banner */}
      {isAdmin && (
        <div className="bg-primary text-primary-foreground py-2 px-4 text-center text-sm font-semibold flex items-center justify-center gap-3">
          <Settings className="w-4 h-4 animate-spin-slow" />
          <span>BACKOFFICE MODE ACTIVE — You have admin controls enabled.</span>
          <button
            onClick={logout}
            className="underline underline-offset-2 hover:opacity-80 transition-opacity ml-2"
          >
            Exit Admin
          </button>
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
                Subscribe
              </Button>
            </Link>
          </nav>

          {/* Mobile Nav */}
          <div className="md:hidden">
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
                      Subscribe
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
            <img src="/logo.svg" alt="MAKEIT.TECH" className="h-7 w-auto" />
            <p className="text-sm text-muted-foreground">
              Empowering creators and builders with cutting-edge technology and insights.
            </p>
          </div>
          <div>
            <h4 className="font-display font-bold mb-4">Platform</h4>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li><Link href="/episodes" className="hover:text-primary transition-colors">Episodes</Link></li>
              <li><Link href="/series" className="hover:text-primary transition-colors">Series</Link></li>
              <li><Link href="/hosts" className="hover:text-primary transition-colors">Hosts</Link></li>
            </ul>
          </div>
          <div>
            <h4 className="font-display font-bold mb-4">Company</h4>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li><Link href="/about" className="hover:text-primary transition-colors">About Us</Link></li>
              <li><Link href="/careers" className="hover:text-primary transition-colors">Careers</Link></li>
              <li><Link href="/contact" className="hover:text-primary transition-colors">Contact</Link></li>
            </ul>
          </div>
          <div>
            <h4 className="font-display font-bold mb-4">Legal</h4>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li><Link href="/privacy" className="hover:text-primary transition-colors">Privacy Policy</Link></li>
              <li><Link href="/terms" className="hover:text-primary transition-colors">Terms of Service</Link></li>
            </ul>
          </div>
        </div>

        <div className="container mx-auto px-4 mt-12 pt-8 border-t flex flex-col sm:flex-row items-center justify-between gap-4">
          <p className="text-xs text-muted-foreground">
            © {new Date().getFullYear()} MAKEIT.TECH. All rights reserved.
          </p>
          {/* Subtle admin toggle */}
          <button
            onClick={isAdmin ? logout : openLogin}
            className="flex items-center gap-1.5 text-xs text-muted-foreground/40 hover:text-muted-foreground transition-colors"
            title={isAdmin ? "Exit backoffice" : "Backoffice access"}
          >
            {isAdmin ? <Unlock className="w-3 h-3" /> : <Lock className="w-3 h-3" />}
            {isAdmin ? "Exit Admin" : "Admin"}
          </button>
        </div>
      </footer>
    </div>
  );
}
