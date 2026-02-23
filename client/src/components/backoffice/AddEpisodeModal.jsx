import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Plus, Trash2, Loader2, Sparkles, CheckCircle2, Zap, FileText } from "lucide-react";
import { useCreateEpisode, useExtractYouTube } from "@/hooks/use-episodes";
import { useToast } from "@/hooks/use-toast";

const CATEGORIES = [
  "Technology",
  "Hardware & PCB",
  "Design",
  "Business",
  "AI & Software",
  "Innovation",
  "Other",
];

const emptyTranscript = () => ({ time: "", topic: "", text: "" });

const DEFAULT_FORM = {
  title: "",
  description: "",
  youtubeUrl: "",
  videoUrl: "",
  thumbnailUrl: "",
  category: "Technology",
};

export function AddEpisodeModal({ open, onClose }) {
  const { toast } = useToast();
  const { mutate: createEpisode, isPending: isPublishing } = useCreateEpisode();
  const { mutate: extractYouTube, isPending: isExtracting } = useExtractYouTube();

  const [form, setForm] = useState(DEFAULT_FORM);
  const [transcripts, setTranscripts] = useState([emptyTranscript()]);
  // Track which fields were auto-filled by extraction
  const [autoFilled, setAutoFilled] = useState({});
  // Extraction options
  const [transcriptSource, setTranscriptSource] = useState(null); // null | "supadata" | "file"
  const [transcriptText, setTranscriptText] = useState("");
  const [analysisMode, setAnalysisMode] = useState(null); // null | "full" | "summary"

  const updateField = (field, value) => {
    setForm((f) => ({ ...f, [field]: value }));
    // Clear auto-fill badge if user edits manually
    if (autoFilled[field]) setAutoFilled((a) => ({ ...a, [field]: false }));
  };

  const updateTranscript = (idx, field, value) =>
    setTranscripts((t) => t.map((row, i) => (i === idx ? { ...row, [field]: value } : row)));

  const addTranscriptRow = () => setTranscripts((t) => [...t, emptyTranscript()]);
  const removeTranscriptRow = (idx) => setTranscripts((t) => t.filter((_, i) => i !== idx));

  const handleExtract = () => {
    if (!form.youtubeUrl.trim()) {
      toast({ title: "YouTube URL required", description: "Please enter a YouTube URL before extracting.", variant: "destructive" });
      return;
    }
    if (!form.title.trim()) {
      toast({ title: "Title required", description: "Please enter a title before extracting.", variant: "destructive" });
      return;
    }

    extractYouTube(
      { youtubeUrl: form.youtubeUrl, title: form.title, transcriptSource, transcriptText, analysisMode },
      {
        onSuccess: (data) => {
          setForm((f) => ({
            ...f,
            videoUrl: data.videoUrl ?? f.videoUrl,
            thumbnailUrl: data.thumbnailUrl ?? f.thumbnailUrl,
            description: data.description ?? f.description,
            category: data.category ?? f.category,
          }));
          if (data.keyMoments?.length) {
            setTranscripts(data.keyMoments.map((m) => ({
              time: m.time ?? "",
              topic: m.topic ?? "",
              text: m.text ?? "",
            })));
          }
          setAutoFilled({
            videoUrl: !!data.videoUrl,
            thumbnailUrl: !!data.thumbnailUrl,
            description: !!data.description,
            category: !!data.category,
            transcripts: !!(data.keyMoments?.length),
          });
          toast({ title: "Extracted successfully", description: "All fields have been auto-filled. Review and publish when ready." });
        },
        onError: (err) => {
          toast({ title: "Extraction failed", description: err.message, variant: "destructive" });
        },
      }
    );
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!form.title.trim() || !form.description.trim() || !form.videoUrl.trim() || !form.thumbnailUrl.trim()) {
      toast({ title: "Required fields missing", description: "Please fill in all required fields, or use Extract to auto-fill them.", variant: "destructive" });
      return;
    }

    const validTranscripts = transcripts.filter((t) => t.time.trim() && t.topic.trim() && t.text.trim());

    createEpisode(
      { title: form.title, description: form.description, videoUrl: form.videoUrl, thumbnailUrl: form.thumbnailUrl, category: form.category, transcripts: validTranscripts },
      {
        onSuccess: () => {
          toast({ title: "Episode published", description: `"${form.title}" is now live on the platform.` });
          handleClose();
        },
        onError: (err) => {
          toast({ title: "Failed to publish episode", description: err.message, variant: "destructive" });
        },
      }
    );
  };

  const handleClose = () => {
    setForm(DEFAULT_FORM);
    setTranscripts([emptyTranscript()]);
    setAutoFilled({});
    setTranscriptSource(null);
    setTranscriptText("");
    setAnalysisMode(null);
    onClose();
  };

  const AutoBadge = ({ field }) =>
    autoFilled[field] ? (
      <Badge variant="outline" className="gap-1 text-xs font-normal text-emerald-600 border-emerald-300 bg-emerald-50 dark:bg-emerald-950/30 dark:border-emerald-800 dark:text-emerald-400">
        <CheckCircle2 className="w-3 h-3" /> Auto-extracted
      </Badge>
    ) : null;

  const canExtract =
    form.title.trim().length > 0 &&
    form.youtubeUrl.trim().length > 0 &&
    transcriptSource !== null &&
    analysisMode !== null &&
    (transcriptSource === "supadata" || transcriptText.trim().length > 0);

  const isLoading = isPublishing || isExtracting;

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) handleClose(); }}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Add New Episode</DialogTitle>
          <DialogDescription>
            Enter a title and YouTube URL, then click <strong>Extract</strong> to auto-fill everything else.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-5">

          {/* ── Step 1: Title + YouTube URL ── */}
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="ep-title">Title <span className="text-destructive">*</span></Label>
              <Input
                id="ep-title"
                placeholder="e.g. Building a Hardware Startup"
                value={form.title}
                onChange={(e) => updateField("title", e.target.value)}
                disabled={isLoading}
                required
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="ep-yt">YouTube URL <span className="text-destructive">*</span></Label>
              <div className="flex gap-2">
                <Input
                  id="ep-yt"
                  type="url"
                  placeholder="https://www.youtube.com/watch?v=…"
                  value={form.youtubeUrl}
                  onChange={(e) => updateField("youtubeUrl", e.target.value)}
                  disabled={isLoading}
                  className="flex-1"
                />
                <Button
                  type="button"
                  onClick={handleExtract}
                  disabled={!canExtract || isLoading}
                  className={`gap-2 shrink-0 transition-all duration-200 ${canExtract ? "opacity-100" : "opacity-25 blur-[1px] cursor-not-allowed pointer-events-none"}`}
                >
                  {isExtracting
                    ? <><Loader2 className="w-4 h-4 animate-spin" /> Extracting…</>
                    : <><Sparkles className="w-4 h-4" /> Extract</>
                  }
                </Button>
              </div>
            </div>

            {/* Transcript Source */}
            <div className="space-y-2">
              <Label>Transcript Source</Label>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setTranscriptSource("supadata")}
                  disabled={isLoading}
                  className={`inline-flex items-center gap-1.5 text-sm font-medium px-3 py-1.5 rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
                    transcriptSource === "supadata"
                      ? "bg-primary text-primary-foreground"
                      : "border border-input bg-background text-foreground hover:bg-accent hover:text-accent-foreground"
                  }`}
                >
                  <Zap className="w-3.5 h-3.5" /> Auto (YouTube)
                </button>
                <button
                  type="button"
                  onClick={() => setTranscriptSource("file")}
                  disabled={isLoading}
                  className={`inline-flex items-center gap-1.5 text-sm font-medium px-3 py-1.5 rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
                    transcriptSource === "file"
                      ? "bg-primary text-primary-foreground"
                      : "border border-input bg-background text-foreground hover:bg-accent hover:text-accent-foreground"
                  }`}
                >
                  <FileText className="w-3.5 h-3.5" /> Import file
                </button>
              </div>
              <p className="text-xs text-muted-foreground">
                Auto fetches captions from YouTube via Supadata. Import lets you upload or paste a transcript from Premiere or any tool.
              </p>
              {transcriptSource === "file" && (
                <div className="space-y-3 mt-3">
                  <div>
                    <label className="text-sm font-medium">Upload transcript file (.txt .srt .vtt)</label>
                    <input
                      type="file"
                      accept=".txt,.srt,.vtt"
                      disabled={isLoading}
                      onChange={(e) => {
                        const file = e.target.files[0];
                        if (!file) return;
                        const reader = new FileReader();
                        reader.onload = (ev) => setTranscriptText(ev.target.result);
                        reader.readAsText(file);
                      }}
                      className="block w-full mt-1 text-sm file:mr-3 file:py-1 file:px-3 file:rounded-md file:border-0 file:text-sm file:font-medium file:bg-muted file:text-foreground hover:file:bg-muted/80 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                    />
                  </div>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <div className="flex-1 h-px bg-border" />
                    or paste directly
                    <div className="flex-1 h-px bg-border" />
                  </div>
                  <textarea
                    value={transcriptText}
                    onChange={(e) => setTranscriptText(e.target.value)}
                    placeholder="Paste transcript here — supports [MM:SS] format or plain text from Premiere, Descript, etc."
                    disabled={isLoading}
                    className="w-full h-36 text-sm p-2 border border-input rounded-md resize-y bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring disabled:opacity-50 disabled:cursor-not-allowed"
                  />
                </div>
              )}
            </div>

            {/* Analysis Mode */}
            <div className="space-y-2">
              <Label>Analysis Mode</Label>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setAnalysisMode("full")}
                  disabled={isLoading}
                  className={`inline-flex items-center text-sm font-medium px-3 py-1.5 rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
                    analysisMode === "full"
                      ? "bg-primary text-primary-foreground"
                      : "border border-input bg-background text-foreground hover:bg-accent hover:text-accent-foreground"
                  }`}
                >
                  Full analysis
                </button>
                <button
                  type="button"
                  onClick={() => setAnalysisMode("summary")}
                  disabled={isLoading}
                  className={`inline-flex items-center text-sm font-medium px-3 py-1.5 rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
                    analysisMode === "summary"
                      ? "bg-primary text-primary-foreground"
                      : "border border-input bg-background text-foreground hover:bg-accent hover:text-accent-foreground"
                  }`}
                >
                  Summarised
                </button>
              </div>
              <p className="text-xs text-muted-foreground">
                Full sends the complete transcript — best under 45 min. Summarised samples evenly across the video — recommended for longer episodes.
              </p>
            </div>
          </div>

          <Separator />

          {/* ── Step 2: Auto-filled fields (review & edit) ── */}
          <div className="space-y-4">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Review &amp; edit — auto-filled after extraction
            </p>

            <div className="space-y-1.5">
              <div className="flex items-center gap-2">
                <Label htmlFor="ep-desc">Description <span className="text-destructive">*</span></Label>
                <AutoBadge field="description" />
              </div>
              <Textarea
                id="ep-desc"
                placeholder="A short description of what this episode covers…"
                value={form.description}
                onChange={(e) => updateField("description", e.target.value)}
                rows={3}
                disabled={isLoading}
                required
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <div className="flex items-center gap-2">
                  <Label htmlFor="ep-video">Video URL <span className="text-destructive">*</span></Label>
                  <AutoBadge field="videoUrl" />
                </div>
                <Input
                  id="ep-video"
                  type="url"
                  placeholder="https://www.youtube.com/embed/…"
                  value={form.videoUrl}
                  onChange={(e) => updateField("videoUrl", e.target.value)}
                  disabled={isLoading}
                  required
                />
              </div>
              <div className="space-y-1.5">
                <div className="flex items-center gap-2">
                  <Label htmlFor="ep-thumb">Thumbnail URL <span className="text-destructive">*</span></Label>
                  <AutoBadge field="thumbnailUrl" />
                </div>
                <Input
                  id="ep-thumb"
                  type="url"
                  placeholder="https://img.youtube.com/vi/…"
                  value={form.thumbnailUrl}
                  onChange={(e) => updateField("thumbnailUrl", e.target.value)}
                  disabled={isLoading}
                  required
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center gap-2">
                <Label>Category <span className="text-destructive">*</span></Label>
                <AutoBadge field="category" />
              </div>
              <Select value={form.category} onValueChange={(v) => updateField("category", v)} disabled={isLoading}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a category" />
                </SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map((cat) => (
                    <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <Separator />

          {/* ── Key Moments ── */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Label className="text-base font-semibold">
                  Key Moments <span className="text-muted-foreground font-normal text-sm">(used by PCB)</span>
                </Label>
                <AutoBadge field="transcripts" />
              </div>
              <Button type="button" variant="outline" size="sm" onClick={addTranscriptRow} disabled={isLoading} className="gap-1.5">
                <Plus className="w-3.5 h-3.5" /> Add Row
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Key moments let PCB pinpoint exact timestamps. The more you add, the better PCB works.
            </p>

            <div className="space-y-2">
              {transcripts.map((row, idx) => (
                <div key={idx} className="grid grid-cols-[80px_1fr_1fr_auto] gap-2 items-start">
                  <Input
                    placeholder="MM:SS"
                    value={row.time}
                    onChange={(e) => updateTranscript(idx, "time", e.target.value)}
                    disabled={isLoading}
                    className="text-sm font-mono"
                  />
                  <Input
                    placeholder="Topic"
                    value={row.topic}
                    onChange={(e) => updateTranscript(idx, "topic", e.target.value)}
                    disabled={isLoading}
                    className="text-sm"
                  />
                  <Input
                    placeholder="Description"
                    value={row.text}
                    onChange={(e) => updateTranscript(idx, "text", e.target.value)}
                    disabled={isLoading}
                    className="text-sm"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => removeTranscriptRow(idx)}
                    disabled={isLoading || transcripts.length === 1}
                    className="text-muted-foreground hover:text-destructive shrink-0"
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              ))}
            </div>
          </div>

          <Separator />

          <div className="flex justify-end gap-3">
            <Button type="button" variant="outline" onClick={handleClose} disabled={isLoading}>
              Cancel
            </Button>
            <Button type="submit" disabled={isLoading} className="gap-2">
              {isPublishing
                ? <><Loader2 className="w-4 h-4 animate-spin" /> Publishing…</>
                : "Publish Episode"
              }
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
