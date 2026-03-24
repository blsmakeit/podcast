import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Layout } from "@/components/Layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Loader2, DollarSign, Zap, BarChart2, Clock } from "lucide-react";
import { useBackoffice } from "@/components/backoffice/BackofficeContext";
import { Redirect } from "wouter";

const API_BASE = import.meta.env.VITE_API_URL ?? "";

function formatCost(micros) {
  return `$${(micros / 1_000_000).toFixed(4)}`;
}

function formatTokens(n) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

function endpointLabel(ep) {
  const map = {
    "chat": "RAG Chat",
    "draft-generation": "Draft Generation",
    "background_generation": "Background (Gemini Imagen)",
    "description_improvement": "Description AI Improvement",
  };
  if (ep.startsWith("post-generation:")) return `Post: ${ep.split(":")[1]}`;
  return map[ep] ?? ep;
}

export default function MetricsDashboard() {
  const { isAdmin } = useBackoffice();
  const [, setLocation] = useLocation();

  if (!isAdmin) return <Redirect to="/" />;

  const { data: metrics, isLoading } = useQuery({
    queryKey: ["/api/social-media/metrics"],
    queryFn: async () => {
      const res = await fetch(`${API_BASE}/api/social-media/metrics`);
      if (!res.ok) throw new Error("Failed to load metrics");
      const json = await res.json();
      return json.data;
    },
    refetchInterval: 30_000,
  });

  const byEndpointEntries = metrics
    ? Object.entries(metrics.byEndpoint).sort((a, b) => b[1].costMicros - a[1].costMicros)
    : [];

  return (
    <Layout>
      <div className="container mx-auto px-4 py-8 max-w-5xl">
        <div className="flex items-center gap-3 mb-6">
          <Button variant="ghost" size="sm" onClick={() => setLocation("/admin/social-media")} className="gap-1.5">
            <ArrowLeft className="w-4 h-4" /> Back
          </Button>
          <div>
            <h1 className="text-2xl font-display font-bold">Claude API Metrics</h1>
            <p className="text-sm text-muted-foreground">Usage and cost tracking across all Social Media Manager calls</p>
          </div>
        </div>

        {isLoading ? (
          <div className="flex items-center gap-2 text-muted-foreground py-12 justify-center">
            <Loader2 className="w-5 h-5 animate-spin" /> Loading metrics…
          </div>
        ) : !metrics ? (
          <p className="text-muted-foreground text-center py-12">No usage data yet.</p>
        ) : (
          <div className="space-y-6">
            {/* Summary cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <Card>
                <CardContent className="pt-4 pb-4">
                  <div className="flex items-center gap-2 mb-1">
                    <DollarSign className="w-4 h-4 text-green-600" />
                    <span className="text-xs text-muted-foreground uppercase tracking-wide">Total Cost</span>
                  </div>
                  <p className="text-2xl font-bold font-mono">{formatCost(metrics.totalCostMicros)}</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-4 pb-4">
                  <div className="flex items-center gap-2 mb-1">
                    <Zap className="w-4 h-4 text-yellow-500" />
                    <span className="text-xs text-muted-foreground uppercase tracking-wide">Total Calls</span>
                  </div>
                  <p className="text-2xl font-bold font-mono">{metrics.totalCalls}</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-4 pb-4">
                  <div className="flex items-center gap-2 mb-1">
                    <BarChart2 className="w-4 h-4 text-blue-500" />
                    <span className="text-xs text-muted-foreground uppercase tracking-wide">Input Tokens</span>
                  </div>
                  <p className="text-2xl font-bold font-mono">{formatTokens(metrics.totalInputTokens)}</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-4 pb-4">
                  <div className="flex items-center gap-2 mb-1">
                    <BarChart2 className="w-4 h-4 text-purple-500" />
                    <span className="text-xs text-muted-foreground uppercase tracking-wide">Output Tokens</span>
                  </div>
                  <p className="text-2xl font-bold font-mono">{formatTokens(metrics.totalOutputTokens)}</p>
                </CardContent>
              </Card>
            </div>

            {/* By endpoint */}
            {byEndpointEntries.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Cost by Endpoint</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {byEndpointEntries.map(([ep, data]) => {
                      const pct = metrics.totalCostMicros > 0
                        ? (data.costMicros / metrics.totalCostMicros) * 100
                        : 0;
                      return (
                        <div key={ep}>
                          <div className="flex items-center justify-between text-sm mb-1">
                            <span className="font-medium">{endpointLabel(ep)}</span>
                            <div className="flex items-center gap-3 text-xs text-muted-foreground">
                              <span>{data.calls} call{data.calls !== 1 ? "s" : ""}</span>
                              <span className="font-mono font-semibold text-foreground">{formatCost(data.costMicros)}</span>
                            </div>
                          </div>
                          <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                            <div
                              className="h-full bg-primary rounded-full"
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Recent calls */}
            {metrics.recent?.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <Clock className="w-4 h-4" /> Recent Calls
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-xs text-muted-foreground border-b">
                          <th className="text-left pb-2 pr-4">Endpoint</th>
                          <th className="text-right pb-2 pr-4">In</th>
                          <th className="text-right pb-2 pr-4">Out</th>
                          <th className="text-right pb-2">Cost</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {metrics.recent.map((log) => (
                          <tr key={log.id} className="text-xs">
                            <td className="py-1.5 pr-4 font-medium">{endpointLabel(log.endpoint)}</td>
                            <td className="py-1.5 pr-4 text-right font-mono text-muted-foreground">{formatTokens(log.inputTokens)}</td>
                            <td className="py-1.5 pr-4 text-right font-mono text-muted-foreground">{formatTokens(log.outputTokens)}</td>
                            <td className="py-1.5 text-right font-mono font-semibold">{formatCost(log.costUsd)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        )}
      </div>
    </Layout>
  );
}
