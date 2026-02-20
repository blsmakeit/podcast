import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { AlertTriangle } from "lucide-react";

export default function NotFound() {
  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-background p-4">
      <div className="text-center max-w-md">
        <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-destructive/10 text-destructive mb-6">
          <AlertTriangle className="w-10 h-10" />
        </div>
        <h1 className="font-display font-bold text-4xl mb-4">Page Not Found</h1>
        <p className="text-muted-foreground mb-8 text-lg">
          We couldn't find the page you were looking for. It might have been moved or deleted.
        </p>
        <Link href="/">
          <Button size="lg" className="w-full sm:w-auto">
            Return Home
          </Button>
        </Link>
      </div>
    </div>
  );
}
