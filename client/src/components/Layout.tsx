import { ReactNode } from "react";
import { Link, useLocation } from "wouter";
import { cn } from "@/lib/utils";
import logo from "@assets/screenshot-1771582051592.png";
import { Button } from "@/components/ui/button";
import { Menu, X } from "lucide-react";
import { useState } from "react";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";

export function Layout({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  const navItems = [
    { label: "Home", href: "/" },
    { label: "Episodes", href: "/episodes" },
    { label: "About", href: "/about" },
  ];

  return (
    <div className="min-h-screen flex flex-col bg-background font-body">
      <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container mx-auto px-4 h-16 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2 group">
            <div className="relative overflow-hidden rounded-lg">
              <img 
                src={logo} 
                alt="MAKEIT Logo" 
                className="h-8 w-auto object-contain transition-transform duration-300 group-hover:scale-105" 
              />
            </div>
            <span className="font-display font-bold text-xl tracking-tight hidden sm:block">
              MAKEIT<span className="text-primary">.TECH</span>
            </span>
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
            <Button size="sm" className="font-semibold shadow-lg shadow-primary/20">
              Subscribe
            </Button>
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
                  <Button className="w-full mt-4">Subscribe</Button>
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
            <img src={logo} alt="MAKEIT" className="h-8 w-auto grayscale opacity-70 hover:grayscale-0 hover:opacity-100 transition-all duration-300" />
            <p className="text-sm text-muted-foreground">
              Empowering creators and builders with cutting-edge technology and insights.
            </p>
          </div>
          <div>
            <h4 className="font-display font-bold mb-4">Platform</h4>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li><a href="#" className="hover:text-primary transition-colors">Episodes</a></li>
              <li><a href="#" className="hover:text-primary transition-colors">Series</a></li>
              <li><a href="#" className="hover:text-primary transition-colors">Hosts</a></li>
            </ul>
          </div>
          <div>
            <h4 className="font-display font-bold mb-4">Company</h4>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li><a href="#" className="hover:text-primary transition-colors">About Us</a></li>
              <li><a href="#" className="hover:text-primary transition-colors">Careers</a></li>
              <li><a href="#" className="hover:text-primary transition-colors">Contact</a></li>
            </ul>
          </div>
          <div>
            <h4 className="font-display font-bold mb-4">Legal</h4>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li><a href="#" className="hover:text-primary transition-colors">Privacy</a></li>
              <li><a href="#" className="hover:text-primary transition-colors">Terms</a></li>
            </ul>
          </div>
        </div>
        <div className="container mx-auto px-4 mt-12 pt-8 border-t text-center text-xs text-muted-foreground">
          © {new Date().getFullYear()} MAKEIT.TECH. All rights reserved.
        </div>
      </footer>
    </div>
  );
}
