import { Switch, Route, useLocation } from "wouter";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "./lib/queryClient";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { BackofficeProvider, useBackoffice } from "@/components/backoffice/BackofficeContext";
import { LanguageProvider } from "@/hooks/use-language";

import Home from "@/pages/Home";
import Episodes from "@/pages/Episodes";
import PodcastDetail from "@/pages/PodcastDetail";
import About from "@/pages/About";
import Subscribe from "@/pages/Subscribe";
import Contact from "@/pages/Contact";
import ComingSoon from "@/pages/ComingSoon";
import NotFound from "@/pages/NotFound";
import ChatWidget from "@/components/chat/ChatWidget";
import SocialMediaManager from "@/pages/admin/SocialMediaManager";
import CampaignDraft from "@/pages/admin/CampaignDraft";
import CampaignProduction from "@/pages/admin/CampaignProduction";
import CampaignPublication from "@/pages/admin/CampaignPublication";

function AdminRoute({ component: Component }) {
  const { isAdmin } = useBackoffice();
  const [, setLocation] = useLocation();
  if (!isAdmin) {
    setLocation("/");
    return null;
  }
  return <Component />;
}

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
      <Route path="/admin/social-media" component={() => <AdminRoute component={SocialMediaManager} />} />
      <Route path="/admin/social-media/campaign/:id/draft" component={() => <AdminRoute component={CampaignDraft} />} />
      <Route path="/admin/social-media/campaign/:id/production" component={() => <AdminRoute component={CampaignProduction} />} />
      <Route path="/admin/social-media/campaign/:id/publication" component={() => <AdminRoute component={CampaignPublication} />} />
      <Route component={NotFound} />
    </Switch>
  );
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <LanguageProvider>
      <BackofficeProvider>
        <TooltipProvider>
          <Toaster />
          <Router />
          <ChatWidget />
        </TooltipProvider>
      </BackofficeProvider>
      </LanguageProvider>
    </QueryClientProvider>
  );
}
