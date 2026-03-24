import { execSync } from "child_process";

// Resolve the full path to yt-dlp at module load time.
// pip3 installs to ~/.local/bin which is often not in Node's runtime PATH on Render.
function resolveYtDlpPath(): string {
  const candidates = [
    "which yt-dlp",
    "python3 -m site --user-base 2>/dev/null | xargs -I{} echo {}/bin/yt-dlp | head -1",
  ];

  for (const cmd of candidates) {
    try {
      const result = execSync(cmd, { timeout: 5000 }).toString().trim().split("\n")[0];
      if (result) return result;
    } catch {}
  }

  return "yt-dlp"; // fallback — let the OS resolve it at spawn time
}

export const ytDlpPath = resolveYtDlpPath();
