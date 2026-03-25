import { useState, useRef, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/hooks/use-toast";
import { Upload, Play, Download, Loader2, AlertCircle, ExternalLink, RefreshCw, Youtube, RotateCcw, CheckCircle2, KeyRound } from "lucide-react";
import { Badge } from "@/components/ui/badge";

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
  const cookiesInputRef = useRef(null);
  const [startSeconds, setStartSeconds] = useState(selectedDraft?.teaserTimestampSeconds ?? 0);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [ytUrl, setYtUrl] = useState("");
  const [isDownloading, setIsDownloading] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState(0);
  const [cookiesUploaded, setCookiesUploaded] = useState(false);
  const [isUploadingCookies, setIsUploadingCookies] = useState(false);
  const [showReupload, setShowReupload] = useState(false);

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

  const { mutate: resetTeaser, isPending: isResetting } = useMutation({
    mutationFn: async () => {
      const res = await fetch(`${API_BASE}/api/social-media/campaigns/${campaignId}/teaser/reset`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("Reset failed");
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [`/api/social-media/campaigns/${campaignId}/teaser/status`] });
      toast({ title: "Status reset", description: "You can now upload or download a new source video." });
    },
    onError: () => {
      toast({ title: "Reset failed", description: "Could not reset teaser status.", variant: "destructive" });
    },
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

  const handleReset = useCallback(async () => {
    await resetTeaser();
    qc.invalidateQueries({ queryKey: [`/api/social-media/campaigns/${campaignId}`] });
  }, [resetTeaser, qc, campaignId]);

  const handleCookiesUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsUploadingCookies(true);
    const formData = new FormData();
    formData.append("cookies", file);
    try {
      const res = await fetch(`${API_BASE}/api/social-media/admin/upload-yt-cookies`, {
        method: "POST",
        body: formData,
      });
      if (!res.ok) throw new Error("Upload failed");
      setCookiesUploaded(true);
      toast({ title: "Cookies uploaded", description: "YouTube authentication is now active." });
    } catch (err) {
      toast({ title: "Cookies upload failed", description: err.message, variant: "destructive" });
    } finally {
      setIsUploadingCookies(false);
      if (cookiesInputRef.current) cookiesInputRef.current.value = "";
    }
  };

  const handleFileUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsUploading(true);
    setUploadProgress(0);

    const formData = new FormData();
    formData.append("video", file);

    const xhr = new XMLHttpRequest();

    xhr.upload.addEventListener("progress", (ev) => {
      if (ev.lengthComputable) {
        const pct = Math.round((ev.loaded / ev.total) * 100);
        setUploadProgress(pct);
      }
    });

    xhr.addEventListener("load", () => {
      setIsUploading(false);
      if (xhr.status >= 200 && xhr.status < 300) {
        const json = JSON.parse(xhr.responseText);
        console.log("[upload] success:", json);
        setUploadProgress(100);
        toast({ title: "Video uploaded", description: "Ready to generate teaser clips." });
        qc.invalidateQueries({ queryKey: [`/api/social-media/campaigns/${campaignId}`] });
        qc.invalidateQueries({ queryKey: [`/api/social-media/campaigns/${campaignId}/publication`] });
        qc.invalidateQueries({ queryKey: [`/api/social-media/campaigns/${campaignId}/teaser/status`] });
      } else {
        const json = JSON.parse(xhr.responseText);
        console.error("[upload] error:", json);
        toast({ title: "Upload failed", description: json.message || "Server error", variant: "destructive" });
      }
      if (fileInputRef.current) fileInputRef.current.value = "";
    });

    xhr.addEventListener("error", () => {
      setIsUploading(false);
      toast({ title: "Upload failed", description: "Network error", variant: "destructive" });
      if (fileInputRef.current) fileInputRef.current.value = "";
    });

    xhr.open("POST", `${API_BASE}/api/social-media/campaigns/${campaignId}/teaser/upload-source`);
    xhr.send(formData);
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
              qc.invalidateQueries({ queryKey: [`/api/social-media/campaigns/${campaignId}/publication`] });
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
  const hasSourceVideo = !!(campaign?.sourceVideoUrl) ||
    teaserStatus?.status === "ready" ||
    teaserStatus?.status === "completed";

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
          <p className="text-xs text-muted-foreground">Paste a YouTube URL to auto-download, or upload a file manually below.</p>
        </div>

        <div className="border-t" />

        {/* YouTube Authentication (persistent cookies) */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
              <KeyRound className="w-3.5 h-3.5" /> YouTube Authentication
            </p>
            {cookiesUploaded && (
              <Badge className="bg-green-600 text-white text-xs gap-1 flex items-center">
                <CheckCircle2 className="w-3 h-3" /> Cookies active
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-2">
            <input
              type="file"
              accept=".txt"
              onChange={handleCookiesUpload}
              className="hidden"
              ref={cookiesInputRef}
            />
            <Button
              size="sm"
              variant="outline"
              onClick={() => cookiesInputRef.current?.click()}
              disabled={isUploadingCookies}
              className="gap-1.5 h-7 text-xs"
            >
              {isUploadingCookies ? <Loader2 className="w-3 h-3 animate-spin" /> : <Upload className="w-3 h-3" />}
              {cookiesUploaded ? "Replace cookies.txt" : "Upload cookies.txt"}
            </Button>
            <a
              href="https://github.com/yt-dlp/yt-dlp/wiki/FAQ#how-do-i-pass-cookies-to-yt-dlp"
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-muted-foreground hover:text-primary hover:underline flex items-center gap-1"
            >
              <ExternalLink className="w-3 h-3" /> How to export cookies?
            </a>
          </div>
          <p className="text-xs text-muted-foreground">Upload your browser's YouTube cookies to bypass bot detection on auto-download.</p>
        </div>

        <div className="border-t" />

        {/* Upload area */}
        <input
          ref={fileInputRef}
          type="file"
          accept="video/mp4,video/quicktime"
          className="hidden"
          onChange={handleFileUpload}
        />
        {campaign?.sourceVideoUrl && !showReupload ? (
          <div className="flex items-center gap-2 p-3 rounded-lg bg-green-50 border border-green-200">
            <CheckCircle2 className="w-4 h-4 text-green-600 flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-green-800">Source video ready</p>
              <p className="text-xs text-green-700 truncate">
                {campaign.sourceVideoUrl.split("/").pop()}
              </p>
            </div>
            <button
              onClick={() => setShowReupload(true)}
              className="text-xs text-muted-foreground underline hover:text-foreground flex-shrink-0"
            >
              Replace
            </button>
          </div>
        ) : (
          <div
            className="border-2 border-dashed rounded-lg p-6 text-center cursor-pointer hover:border-primary transition-colors"
            onClick={() => fileInputRef.current?.click()}
          >
            <Upload className="w-8 h-8 mx-auto mb-2 text-muted-foreground" />
            <p className="text-sm font-medium">Drop MP4/MOV here or click to upload</p>
            <p className="text-xs text-muted-foreground mt-1">Max 4GB</p>
          </div>
        )}
        {isUploading && (
          <div className="space-y-1">
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>Uploading video…</span>
              <span>{uploadProgress}%</span>
            </div>
            <div className="h-2 bg-muted rounded-full overflow-hidden">
              <div
                className="h-full bg-primary transition-all duration-300"
                style={{ width: `${uploadProgress}%` }}
              />
            </div>
          </div>
        )}

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
          <div className="space-y-3">
            <div className="flex items-start gap-2 p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">
              <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
              <div>
                <p className="font-medium">Generation failed</p>
                <p className="text-xs">{teaserStatus.error}</p>
                <div className="flex gap-2 mt-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => generateTeaser()}
                    className="gap-1.5 h-7 text-xs"
                  >
                    <RefreshCw className="w-3 h-3" /> Retry
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={handleReset}
                    disabled={isResetting}
                    className="gap-1.5 h-7 text-xs"
                  >
                    {isResetting ? <Loader2 className="w-3 h-3 animate-spin" /> : <RotateCcw className="w-3 h-3" />}
                    Reset status
                  </Button>
                </div>
              </div>
            </div>

            {/* Rate limit / blocked */}
            {(teaserStatus?.error?.includes("rate limit") || teaserStatus?.error?.includes("blocked") || teaserStatus?.error?.includes("manually")) && (
              <div className="p-3 rounded-lg bg-amber-50 border border-amber-200 space-y-1">
                <p className="text-xs font-semibold text-amber-800">Auto-download unavailable</p>
                <p className="text-xs text-amber-700">
                  YouTube is blocking server downloads. Use the manual MP4 upload below.
                </p>
              </div>
            )}

            {/* Bot / auth error */}
            {(teaserStatus?.error?.includes("bot") || teaserStatus?.error?.includes("cookies")) && (
              <div className="p-3 rounded-lg border border-amber-200 bg-amber-50 space-y-1.5">
                <p className="text-xs font-semibold text-amber-800">YouTube requires authentication</p>
                <p className="text-xs text-amber-700">
                  Upload your YouTube cookies using the <span className="font-medium">YouTube Authentication</span> section above, then retry the download. Or upload your MP4 manually.
                </p>
              </div>
            )}
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
