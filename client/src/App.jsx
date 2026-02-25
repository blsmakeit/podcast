import { Switch, Route } from "wouter";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "./lib/queryClient";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { BackofficeProvider } from "@/components/backoffice/BackofficeContext";

import Home from "@/pages/Home";
import Episodes from "@/pages/Episodes";
import PodcastDetail from "@/pages/PodcastDetail";
import About from "@/pages/About";
import Subscribe from "@/pages/Subscribe";
import Contact from "@/pages/Contact";
import ComingSoon from "@/pages/ComingSoon";
import NotFound from "@/pages/NotFound";
import ChatWidget from "@/components/chat/ChatWidget";

function Router() {
  return (
    <Switch>
      <Route path="/" component={Home} />
      <Route path="/episodes" component={Episodes} />
      <Route path="/podcasts/:id" component={PodcastDetail} />
      <Route path="/about" component={About} />
      <Route path="/subscribe" component={Subscribe} />
      <Route path="/series" component={ComingSoon} />
      <Route path="/hosts" component={ComingSoon} />
      <Route path="/careers" component={ComingSoon} />
      <Route path="/contact" component={Contact} />
      <Route path="/privacy" component={ComingSoon} />
      <Route path="/terms" component={ComingSoon} />
      <Route component={NotFound} />
    </Switch>
  );
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BackofficeProvider>
        <TooltipProvider>
          <Toaster />
          <Router />
          <ChatWidget />
        </TooltipProvider>
      </BackofficeProvider>
    </QueryClientProvider>
  );
}
