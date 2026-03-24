import { spawnSync } from "child_process";

// Try known install locations in order. pip3 --user installs to ~/.local/bin,
// which is not in Node's runtime PATH on Render.
const candidatePaths = [
  "/usr/local/bin/yt-dlp",
  "/usr/bin/yt-dlp",
  `${process.env.HOME ?? "/root"}/.local/bin/yt-dlp`,
  "/opt/render/project/src/.venv/bin/yt-dlp",
  "/opt/render/project/.venv/bin/yt-dlp",
  "yt-dlp", // fallback — let the OS resolve via PATH
];

function resolve(): string {
  for (const candidate of candidatePaths) {
    const result = spawnSync(candidate, ["--version"], { timeout: 5000 });
    if (result.status === 0) {
      console.log(`[yt-dlp] found at: ${candidate} — version: ${result.stdout.toString().trim()}`);
      return candidate;
    }
  }

  // Last resort: python3 -m yt_dlp
  const pyResult = spawnSync("python3", ["-m", "yt_dlp", "--version"], { timeout: 5000 });
  if (pyResult.status === 0) {
    console.log("[yt-dlp] available via python3 -m yt_dlp");
    return "__python3_module__";
  }

  console.warn("[yt-dlp] NOT FOUND — YouTube auto-download will fail");
  return "";
}

export const ytDlpPath = resolve();
