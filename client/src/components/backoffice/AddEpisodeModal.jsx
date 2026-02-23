import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Trash2, Loader2 } from "lucide-react";
import { useCreateEpisode } from "@/hooks/use-episodes";
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

export function AddEpisodeModal({ open, onClose }) {
  const { toast } = useToast();
  const { mutate: createEpisode, isPending } = useCreateEpisode();

  const [form, setForm] = useState({
    title: "",
    description: "",
    videoUrl: "",
    thumbnailUrl: "",
    category: "Technology",
  });
  const [transcripts, setTranscripts] = useState([emptyTranscript()]);

  const updateField = (field, value) => setForm((f) => ({ ...f, [field]: value }));

  const updateTranscript = (idx, field, value) =>
    setTranscripts((t) => t.map((row, i) => (i === idx ? { ...row, [field]: value } : row)));

  const addTranscriptRow = () => setTranscripts((t) => [...t, emptyTranscript()]);
  const removeTranscriptRow = (idx) => setTranscripts((t) => t.filter((_, i) => i !== idx));

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!form.title.trim() || !form.description.trim() || !form.videoUrl.trim() || !form.thumbnailUrl.trim()) {
      toast({ title: "Required fields missing", description: "Please fill in all required fields.", variant: "destructive" });
      return;
    }

    const validTranscripts = transcripts.filter((t) => t.time.trim() && t.topic.trim() && t.text.trim());

    createEpisode(
      { ...form, transcripts: validTranscripts },
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
    setForm({ title: "", description: "", videoUrl: "", thumbnailUrl: "", category: "Technology" });
    setTranscripts([emptyTranscript()]);
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) handleClose(); }}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Add New Episode</DialogTitle>
          <DialogDescription>
            Fill in the details below to publish a new episode to the platform.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="ep-title">Title <span className="text-destructive">*</span></Label>
              <Input id="ep-title" placeholder="e.g. Building a Hardware Startup" value={form.title}
                onChange={(e) => updateField("title", e.target.value)} required />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="ep-desc">Description <span className="text-destructive">*</span></Label>
              <Textarea id="ep-desc" placeholder="A short description of what this episode covers…"
                value={form.description} onChange={(e) => updateField("description", e.target.value)} rows={3} required />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="ep-video">Video URL <span className="text-destructive">*</span></Label>
                <Input id="ep-video" type="url" placeholder="https://…" value={form.videoUrl}
                  onChange={(e) => updateField("videoUrl", e.target.value)} required />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ep-thumb">Thumbnail URL <span className="text-destructive">*</span></Label>
                <Input id="ep-thumb" type="url" placeholder="https://…" value={form.thumbnailUrl}
                  onChange={(e) => updateField("thumbnailUrl", e.target.value)} required />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Category <span className="text-destructive">*</span></Label>
              <Select value={form.category} onValueChange={(v) => updateField("category", v)}>
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

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label className="text-base font-semibold">
                Key Moments <span className="text-muted-foreground font-normal text-sm">(optional — used by PCB)</span>
              </Label>
              <Button type="button" variant="outline" size="sm" onClick={addTranscriptRow} className="gap-1.5">
                <Plus className="w-3.5 h-3.5" /> Add Row
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Key moments are used by PCB to pinpoint exact timestamps in your video. The more you add, the better PCB works.
            </p>

            <div className="space-y-2">
              {transcripts.map((row, idx) => (
                <div key={idx} className="grid grid-cols-[80px_1fr_1fr_auto] gap-2 items-start">
                  <Input placeholder="MM:SS" value={row.time}
                    onChange={(e) => updateTranscript(idx, "time", e.target.value)}
                    className="text-sm font-mono" />
                  <Input placeholder="Topic" value={row.topic}
                    onChange={(e) => updateTranscript(idx, "topic", e.target.value)} className="text-sm" />
                  <Input placeholder="Description" value={row.text}
                    onChange={(e) => updateTranscript(idx, "text", e.target.value)} className="text-sm" />
                  <Button type="button" variant="ghost" size="icon"
                    onClick={() => removeTranscriptRow(idx)} disabled={transcripts.length === 1}
                    className="text-muted-foreground hover:text-destructive shrink-0">
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              ))}
            </div>
          </div>

          <Separator />

          <div className="flex justify-end gap-3">
            <Button type="button" variant="outline" onClick={handleClose} disabled={isPending}>Cancel</Button>
            <Button type="submit" disabled={isPending} className="gap-2">
              {isPending ? <><Loader2 className="w-4 h-4 animate-spin" /> Publishing…</> : "Publish Episode"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
