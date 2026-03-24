import { useState, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/hooks/use-toast";
import { Upload, Play, Download, Loader2, AlertCircle, ExternalLink, RefreshCw, Youtube } from "lucide-react";

const API_BASE = import.meta.env.VITE_API_URL ?? "";

function secondsToMmss(s) {
  if (!s && s !== 0) return "00:00";
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
}

export default function VideoTeaserPanel({ campaignId, campaign, selectedDraft }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const fileInputRef = useRef(null);
  const [startSeconds, setStartSeconds] = useState(selectedDraft?.teaserTimestampSeconds ?? 0);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [ytUrl, setYtUrl] = useState("");
  const [isDownloading, setIsDownloading] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState(0);

  const { data: teaserStatus, isLoading: loadingStatus } = useQuery({
    queryKey: [`/api/social-media/campaigns/${campaignId}/teaser/status`],
    queryFn: async () => {
      const res = await fetch(`${API_BASE}/api/social-media/campaigns/${campaignId}/teaser/status`);
      if (!res.ok) return null;
      const json = await res.json();
      return json.data;
    },
    refetchInterval: (data) => {
      if (data?.status === "queued" || data?.status === "processing") return 2000;
      return false;
    },
    enabled: !isNaN(campaignId),
  });

  const { mutate: generateTeaser, isPending: isGenerating } = useMutation({
    mutationFn: async () => {
      const res = await fetch(`${API_BASE}/api/social-media/campaigns/${campaignId}/teaser/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ startSeconds }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ message: "Generation failed" }));
        throw new Error(err.message);
      }
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [`/api/social-media/campaigns/${campaignId}/teaser/status`] });
      toast({ title: "Teaser generation queued", description: "Processing will begin shortly." });
    },
    onError: (err) => {
      toast({ title: "Generation failed", description: err.message, variant: "destructive" });
    },
  });

  const handleFileUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsUploading(true);
    setUploadProgress(0);

    const formData = new FormData();
    formData.append("video", file);

    try {
      const res = await fetch(`${API_BASE}/api/social-media/campaigns/${campaignId}/teaser/upload-source`, {
        method: "POST",
        body: formData,
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ message: "Upload failed" }));
        throw new Error(err.message);
      }
      setUploadProgress(100);
      qc.invalidateQueries({ queryKey: [`/api/social-media/campaigns/${campaignId}`] });
      toast({ title: "Video uploaded", description: "Source video is ready. Configure the clip and generate." });
    } catch (err) {
      toast({ title: "Upload failed", description: err.message, variant: "destructive" });
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleYoutubeDownload = async () => {
    if (!ytUrl.trim()) return;
    setIsDownloading(true);
    setDownloadProgress(0);
    try {
      const res = await fetch(`${API_BASE}/api/social-media/campaigns/${campaignId}/teaser/download-youtube`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ youtubeUrl: ytUrl.trim() }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ message: "Download failed" }));
        throw new Error(err.message);
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.startsWith("data:")) continue;
          try {
            const evt = JSON.parse(line.slice(5).trim());
            if (evt.progress != null) setDownloadProgress(evt.progress);
            if (evt.done) {
              setDownloadProgress(100);
              qc.invalidateQueries({ queryKey: [`/api/social-media/campaigns/${campaignId}`] });
              toast({ title: "YouTube video downloaded", description: "Source video is ready." });
            }
            if (evt.error) throw new Error(evt.error);
          } catch {}
        }
      }
    } catch (err) {
      toast({ title: "Download failed", description: err.message, variant: "destructive" });
    } finally {
      setIsDownloading(false);
    }
  };

  const isProcessing = teaserStatus?.status === "queued" || teaserStatus?.status === "processing";
  const isDone = teaserStatus?.status === "completed" && teaserStatus?.landscapeUrl;
  const hasFailed = teaserStatus?.status === "failed";
  const hasSourceVideo = !!campaign?.sourceVideoUrl;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Video Teaser Clip (20s)</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* YouTube auto-download */}
        <div className="space-y-2">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Auto-download from YouTube</p>
          <div className="flex gap-2">
            <Input
              type="url"
              placeholder="https://youtube.com/watch?v=..."
              value={ytUrl}
              onChange={(e) => setYtUrl(e.target.value)}
              className="h-8 text-sm"
            />
            <Button
              size="sm"
              variant="outline"
              onClick={handleYoutubeDownload}
              disabled={isDownloading || !ytUrl.trim()}
              className="gap-1.5 shrink-0"
            >
              {isDownloading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Youtube className="w-3.5 h-3.5" />}
              Download
            </Button>
          </div>
          {isDownloading && (
            <div className="space-y-1">
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>Downloading…</span>
                <span className="font-mono">{downloadProgress}%</span>
              </div>
              <Progress value={downloadProgress} className="h-1.5" />
            </div>
          )}
          <p className="text-xs text-muted-foreground">Requires yt-dlp installed on server. Or upload manually below.</p>
        </div>

        <div className="border-t" />

        {/* Upload area */}
        <div
          className="border-2 border-dashed rounded-lg p-6 text-center cursor-pointer hover:border-primary transition-colors"
          onClick={() => fileInputRef.current?.click()}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept="video/mp4,video/quicktime"
            className="hidden"
            onChange={handleFileUpload}
          />
          <Upload className="w-8 h-8 mx-auto mb-2 text-muted-foreground" />
          {hasSourceVideo ? (
            <p className="text-sm font-medium text-green-600">Source video uploaded. Click to replace.</p>
          ) : (
            <>
              <p className="text-sm font-medium">Drop MP4/MOV here or click to upload</p>
              <p className="text-xs text-muted-foreground mt-1">Max 4GB</p>
            </>
          )}
          {isUploading && <Progress value={uploadProgress} className="mt-3 h-1.5" />}
        </div>

        {/* Timestamp config */}
        {hasSourceVideo && (
          <div className="space-y-2">
            {selectedDraft?.teaserTimestampSeconds != null && (
              <p className="text-xs text-muted-foreground">
                AI suggested start: <span className="font-mono font-bold">{secondsToMmss(selectedDraft.teaserTimestampSeconds)}</span>
                {selectedDraft.teaserReason && ` — ${selectedDraft.teaserReason}`}
              </p>
            )}
            <div className="flex items-center gap-3">
              <label className="text-sm font-medium shrink-0">Start time (seconds):</label>
              <Input
                type="number"
                value={startSeconds}
                onChange={(e) => setStartSeconds(Number(e.target.value))}
                min={0}
                className="w-24 h-8 text-sm"
              />
              <span className="text-xs text-muted-foreground font-mono">{secondsToMmss(startSeconds)}</span>
            </div>
            <Button
              size="sm"
              onClick={() => generateTeaser()}
              disabled={isGenerating || isProcessing}
              className="gap-2"
            >
              {isGenerating || isProcessing ? (
                <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Generating…</>
              ) : (
                <><Play className="w-3.5 h-3.5" /> Generate Teaser Clips</>
              )}
            </Button>
          </div>
        )}

        {/* Processing progress */}
        {isProcessing && (
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">Processing…</span>
              <span className="font-mono">{teaserStatus.progress ?? 0}%</span>
            </div>
            <Progress value={teaserStatus.progress ?? 0} className="h-2" />
          </div>
        )}

        {/* Error */}
        {hasFailed && (
          <div className="flex items-start gap-2 p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">
            <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
            <div>
              <p className="font-medium">Generation failed</p>
              <p className="text-xs">{teaserStatus.error}</p>
              <Button
                size="sm"
                variant="outline"
                onClick={() => generateTeaser()}
                className="mt-2 gap-1.5 h-7 text-xs"
              >
                <RefreshCw className="w-3 h-3" /> Retry
              </Button>
            </div>
          </div>
        )}

        {/* Results */}
        {isDone && (
          <div className="space-y-3">
            <p className="text-sm font-semibold text-green-700">Teaser clips generated!</p>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <p className="text-xs font-medium">Landscape (16:9)</p>
                <video
                  src={`${API_BASE}${teaserStatus.landscapeUrl}`}
                  controls
                  className="w-full rounded-md"
                />
                <a
                  href={`${API_BASE}${teaserStatus.landscapeUrl}`}
                  download
                  className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                >
                  <Download className="w-3 h-3" /> Download
                </a>
              </div>
              {teaserStatus.portraitUrl && (
                <div className="space-y-1.5">
                  <p className="text-xs font-medium">Portrait (9:16)</p>
                  <video
                    src={`${API_BASE}${teaserStatus.portraitUrl}`}
                    controls
                    className="w-full rounded-md max-h-48 object-contain"
                  />
                  <a
                    href={`${API_BASE}${teaserStatus.portraitUrl}`}
                    download
                    className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                  >
                    <Download className="w-3 h-3" /> Download
                  </a>
                </div>
              )}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
