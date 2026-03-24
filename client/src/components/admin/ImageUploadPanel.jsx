import { useState, useRef, useCallback } from "react";
import { useLocation } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { Upload, X, Loader2, ImagePlus } from "lucide-react";

const API_BASE = import.meta.env.VITE_API_URL ?? "";

const ALL_POST_TYPES = [
  { id: "teaser",       label: "Teaser",          defaultOn: true },
  { id: "guest",        label: "Convidado",        defaultOn: true },
  { id: "insight",      label: "Insight",          defaultOn: true },
  { id: "launch",       label: "Lançamento",       defaultOn: true },
  { id: "brevemente",   label: "Brevemente",       defaultOn: false },
  { id: "reengage",     label: "Re-engagement",    defaultOn: false },
  { id: "carousel",     label: "Carousel",         defaultOn: false },
  { id: "video_teaser", label: "Video Teaser",     defaultOn: false },
];

const ALL_PLATFORMS = ["linkedin", "instagram", "facebook"];

export default function ImageUploadPanel({ isOpen, onClose, onSuccess }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [, setLocation] = useLocation();
  const fileInputRef = useRef(null);

  const [files, setFiles] = useState([]);
  const [previews, setPreviews] = useState([]);
  const [description, setDescription] = useState("");
  const [improvedDescription, setImprovedDescription] = useState(null);
  const [isImproving, setIsImproving] = useState(false);
  const [isImproved, setIsImproved] = useState(false);
  const [selectedPostTypes, setSelectedPostTypes] = useState(
    ALL_POST_TYPES.filter((t) => t.defaultOn).map((t) => t.id)
  );
  const [selectedPlatforms, setSelectedPlatforms] = useState(["linkedin", "instagram"]);
  const [isCreating, setIsCreating] = useState(false);

  const addFiles = useCallback((newFiles) => {
    const combined = [...files, ...newFiles].slice(0, 3);
    setFiles(combined);
    // Revoke old previews
    previews.forEach((p) => URL.revokeObjectURL(p));
    setPreviews(combined.map((f) => URL.createObjectURL(f)));
  }, [files, previews]);

  const removeFile = (idx) => {
    URL.revokeObjectURL(previews[idx]);
    const newFiles = files.filter((_, i) => i !== idx);
    const newPreviews = previews.filter((_, i) => i !== idx);
    setFiles(newFiles);
    setPreviews(newPreviews);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    const dropped = Array.from(e.dataTransfer.files).filter((f) =>
      ["image/jpeg", "image/png", "image/webp"].includes(f.type)
    );
    addFiles(dropped);
  };

  const handleFileInput = (e) => {
    const selected = Array.from(e.target.files ?? []);
    addFiles(selected);
    e.target.value = "";
  };

  const togglePostType = (id) => {
    setSelectedPostTypes((prev) =>
      prev.includes(id) ? prev.filter((t) => t !== id) : [...prev, id]
    );
  };

  const togglePlatform = (p) => {
    setSelectedPlatforms((prev) =>
      prev.includes(p) ? prev.filter((x) => x !== p) : [...prev, p]
    );
  };

  const handleImprove = async () => {
    if (!description.trim()) return;
    setIsImproving(true);
    try {
      const res = await fetch(`${API_BASE}/api/social-media/image-posts/improve-description`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ description }),
      });
      if (!res.ok) throw new Error("Improvement failed");
      const json = await res.json();
      setDescription(json.data.improvedDescription);
      setImprovedDescription(json.data.improvedDescription);
      setIsImproved(true);
      toast({ title: "Description improved by Claude" });
    } catch (err) {
      toast({ title: "Failed to improve", description: err.message, variant: "destructive" });
    } finally {
      setIsImproving(false);
    }
  };

  const handleCreate = async () => {
    if (files.length === 0 || !description.trim()) return;
    setIsCreating(true);
    try {
      // Step 1: Upload images
      const formData = new FormData();
      files.forEach((f) => formData.append("images", f));
      const uploadRes = await fetch(`${API_BASE}/api/social-media/media/upload`, {
        method: "POST",
        body: formData,
      });
      if (!uploadRes.ok) throw new Error("Image upload failed");
      const uploadJson = await uploadRes.json();
      const imageUrls = (uploadJson.data ?? []).map((f) => f.fileUrl);

      // Step 2: Create campaign
      const campaignRes = await fetch(`${API_BASE}/api/social-media/campaigns/image-only`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          description: improvedDescription || description,
          imageUrls,
          postTypes: selectedPostTypes,
          platforms: selectedPlatforms,
        }),
      });
      if (!campaignRes.ok) throw new Error("Campaign creation failed");
      const campaignJson = await campaignRes.json();

      qc.invalidateQueries({ queryKey: ["/api/social-media/campaigns"] });
      onSuccess?.();
      setLocation(`/admin/social-media/campaign/${campaignJson.data.campaignId}/production`);
    } catch (err) {
      toast({ title: "Failed to create campaign", description: err.message, variant: "destructive" });
    } finally {
      setIsCreating(false);
    }
  };

  const handleClose = () => {
    previews.forEach((p) => URL.revokeObjectURL(p));
    setFiles([]);
    setPreviews([]);
    setDescription("");
    setImprovedDescription(null);
    setIsImproved(false);
    setIsCreating(false);
    onClose?.();
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open) handleClose(); }}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>New Image Post</DialogTitle>
          <DialogDescription>Create posts from images without a video episode.</DialogDescription>
        </DialogHeader>

        <div className="space-y-5 py-2">
          {/* Section 1 — Images */}
          <div className="space-y-3">
            <p className="text-sm font-semibold">Images</p>
            <div
              className="border-2 border-dashed rounded-lg p-5 text-center cursor-pointer hover:border-primary transition-colors"
              onClick={() => fileInputRef.current?.click()}
              onDragOver={(e) => e.preventDefault()}
              onDrop={handleDrop}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                multiple
                className="hidden"
                onChange={handleFileInput}
              />
              <Upload className="w-7 h-7 mx-auto mb-2 text-muted-foreground" />
              <p className="text-sm font-medium">Drop images here or click to select</p>
              <p className="text-xs text-muted-foreground mt-1">Up to 3 images · JPEG, PNG, WebP · max 10MB each</p>
            </div>

            {previews.length > 0 && (
              <div className="flex gap-2 flex-wrap">
                {previews.map((src, idx) => (
                  <div key={idx} className="relative w-20 h-20 rounded-md overflow-hidden border">
                    <img src={src} alt="" className="w-full h-full object-cover" />
                    <button
                      onClick={() => removeFile(idx)}
                      className="absolute top-0.5 right-0.5 bg-black/60 text-white rounded-full w-4 h-4 flex items-center justify-center hover:bg-black/80"
                    >
                      <X className="w-2.5 h-2.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
            <p className="text-xs text-muted-foreground">{files.length}/3 images</p>
          </div>

          {/* Section 2 — Description */}
          <div className="space-y-2">
            <label className="text-sm font-semibold">What is this about? <span className="text-destructive">*</span></label>
            <Textarea
              rows={4}
              placeholder="Describe the company moment, achievement, or event. E.g. 'We just shipped our first production PCB batch — 500 units for a European startup client.'"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div>
                {isImproved && (
                  <Badge className="bg-green-600 text-white text-xs">✓ Improved by Claude</Badge>
                )}
              </div>
              <Button
                size="sm"
                variant="outline"
                onClick={handleImprove}
                disabled={!description.trim() || isImproving}
              >
                {isImproving ? (
                  <><Loader2 className="w-3 h-3 animate-spin mr-1" />Improving...</>
                ) : "Improve with AI"}
              </Button>
            </div>
          </div>

          {/* Section 3 — Post types */}
          <div className="space-y-2">
            <p className="text-sm font-semibold">Post types to generate</p>
            <div className="grid grid-cols-2 gap-1.5">
              {ALL_POST_TYPES.map((t) => (
                <label key={t.id} className="flex items-center gap-2 cursor-pointer text-sm py-1">
                  <input
                    type="checkbox"
                    checked={selectedPostTypes.includes(t.id)}
                    onChange={() => togglePostType(t.id)}
                    className="rounded"
                  />
                  {t.label}
                </label>
              ))}
            </div>
          </div>

          {/* Section 4 — Platforms */}
          <div className="space-y-2">
            <p className="text-sm font-semibold">Target platforms</p>
            <div className="flex gap-4">
              {ALL_PLATFORMS.map((p) => (
                <label key={p} className="flex items-center gap-2 cursor-pointer text-sm capitalize">
                  <input
                    type="checkbox"
                    checked={selectedPlatforms.includes(p)}
                    onChange={() => togglePlatform(p)}
                    className="rounded"
                  />
                  {p}
                </label>
              ))}
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleClose}>Cancel</Button>
          <Button
            onClick={handleCreate}
            disabled={files.length === 0 || !description.trim() || isCreating}
          >
            {isCreating ? (
              <><Loader2 className="w-4 h-4 animate-spin mr-1" />Creating...</>
            ) : "Create Campaign →"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
