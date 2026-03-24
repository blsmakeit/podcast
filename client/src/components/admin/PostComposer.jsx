import { useRef } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Download, Copy } from "lucide-react";
import CharCountBadge from "@/components/admin/CharCountBadge";

const API_BASE = import.meta.env.VITE_API_URL ?? "";

const PLATFORM_DIMS = {
  instagram: { w: 380, h: 380 },
  linkedin: { w: 380, h: 214 },
};

function getBackground(backgroundUrl) {
  if (!backgroundUrl) return null;
  // SVG served from the backgrounds/preview API endpoint
  if (backgroundUrl.includes("/api/social-media/backgrounds") || backgroundUrl.endsWith(".svg")) {
    return { type: "img", src: backgroundUrl };
  }
  // PNG/JPG from uploads
  return { type: "div", src: backgroundUrl };
}

export default function PostComposer({ backgroundUrl, content, platform, episodeTitle, guestName, thumbnailUrl }) {
  const { toast } = useToast();
  const previewRef = useRef(null);
  const { w, h } = PLATFORM_DIMS[platform] ?? { w: 380, h: 380 };
  const bg = getBackground(backgroundUrl);

  const handleCopy = () => {
    if (!content) return;
    navigator.clipboard.writeText(content).then(() => {
      toast({ title: "Caption copied" });
    });
  };

  const handleDownload = async () => {
    if (!previewRef.current) return;
    try {
      const html2canvas = (await import("html2canvas")).default;
      const canvas = await html2canvas(previewRef.current, {
        scale: 2,
        useCORS: true,
        allowTaint: true,
      });
      const link = document.createElement("a");
      link.download = `${platform ?? "post"}-preview.png`;
      link.href = canvas.toDataURL("image/png");
      link.click();
    } catch (err) {
      toast({ title: "Download failed", description: err.message, variant: "destructive" });
    }
  };

  return (
    <div className="space-y-3">
      {/* Visual preview card */}
      <div
        ref={previewRef}
        style={{ width: w, height: h, position: "relative", overflow: "hidden", borderRadius: 8, flexShrink: 0 }}
      >
        {/* Layer 1 — Background */}
        {bg?.type === "img" && (
          <img
            src={`${API_BASE}${bg.src}`}
            crossOrigin="anonymous"
            style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }}
            alt=""
          />
        )}
        {bg?.type === "div" && (
          <div
            style={{
              position: "absolute", inset: 0,
              backgroundImage: `url(${API_BASE}${bg.src})`,
              backgroundSize: "cover",
              backgroundPosition: "center",
            }}
          />
        )}
        {!bg && (
          <div style={{ position: "absolute", inset: 0, background: "#080808" }} />
        )}

        {/* Layer 2 — Bottom branding overlay */}
        <div
          style={{
            position: "absolute", bottom: 0, left: 0, right: 0,
            height: "35%",
            background: "linear-gradient(to bottom, transparent, rgba(0,0,0,0.88))",
            padding: "12px 14px 14px",
            display: "flex", flexDirection: "column", justifyContent: "flex-end",
          }}
        >
          <span style={{ color: "#D42B2B", fontSize: 9, letterSpacing: 3, textTransform: "uppercase", fontWeight: 700 }}>
            MAKEITorBREAKIT
          </span>
          <p style={{
            color: "white", fontWeight: 700,
            fontSize: platform === "linkedin" ? 13 : 15,
            lineHeight: 1.2, margin: "3px 0",
          }}>
            {episodeTitle ?? ""}
          </p>
          {guestName && (
            <p style={{ color: "rgba(255,255,255,0.65)", fontSize: 11 }}>{guestName}</p>
          )}
        </div>
      </div>

      {/* Platform badge */}
      <Badge variant="outline" className="capitalize">{platform ?? "post"}</Badge>

      {/* Caption */}
      {content && (
        <textarea
          readOnly
          value={content}
          style={{ maxHeight: 100 }}
          className="w-full text-xs font-mono p-2 rounded border bg-muted resize-none overflow-y-auto"
        />
      )}

      {/* Char count + actions */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        {content && <CharCountBadge current={content.length} platform={platform} />}
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={handleCopy} className="gap-1.5 h-7 text-xs">
            <Copy className="w-3 h-3" /> Copy caption
          </Button>
          <Button size="sm" variant="outline" onClick={handleDownload} className="gap-1.5 h-7 text-xs">
            <Download className="w-3 h-3" /> Download preview
          </Button>
        </div>
      </div>
    </div>
  );
}
