import { spawnSync, execSync } from "child_process";

// Try known install locations in order. pip3 --user installs to ~/.local/bin,
// which is not in Node's runtime PATH on Render.
const candidatePaths = [
  "/usr/local/bin/yt-dlp",
  "/usr/bin/yt-dlp",
  `${process.env.HOME ?? "/root"}/.local/bin/yt-dlp`,
  "/root/.local/bin/yt-dlp",
  "/opt/render/project/src/.local/bin/yt-dlp",
  "/opt/render/project/src/.venv/bin/yt-dlp",
  "/opt/render/project/.venv/bin/yt-dlp",
  "yt-dlp", // fallback — let the OS resolve via PATH
];

function findViashell(): string {
  try {
    const result = execSync(
      "find /opt/render /root /home -name 'yt-dlp' -type f 2>/dev/null | head -1",
      { timeout: 8000 }
    ).toString().trim();
    if (result) {
      console.log(`[yt-dlp] found via shell find: ${result}`);
      return result;
    }
  } catch {
    // find not available or timed out
  }
  return "";
}

function resolve(): string {
  for (const candidate of candidatePaths) {
    const result = spawnSync(candidate, ["--version"], { timeout: 5000 });
    if (result.status === 0) {
      console.log(`[yt-dlp] found at: ${candidate} — version: ${result.stdout.toString().trim()}`);
      return candidate;
    }
  }

  // Shell find fallback — searches Render-specific directories
  const found = findViashell();
  if (found) {
    const result = spawnSync(found, ["--version"], { timeout: 5000 });
    if (result.status === 0) {
      console.log(`[yt-dlp] shell-found binary works — version: ${result.stdout.toString().trim()}`);
      return found;
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

let ytDlpPath = resolve();

// pip3 show fallback — derives bin path from the package install location
if (!ytDlpPath) {
  try {
    const pipShow = execSync(
      "pip3 show yt-dlp 2>/dev/null | grep Location",
      { timeout: 5000 }
    ).toString().trim();
    if (pipShow) {
      const location = pipShow.replace("Location: ", "").trim();
      const candidate = `${location}/../../../bin/yt-dlp`;
      const r = spawnSync(candidate, ["--version"], { timeout: 3000 });
      if (r.status === 0) {
        ytDlpPath = candidate;
        console.log("[yt-dlp] found via pip3 show:", candidate);
      }
    }
  } catch {}
}

console.log("[yt-dlp] final resolved path:", ytDlpPath || "NOT FOUND");

// Log runtime PATH for debugging on Render
try {
  const env = execSync("env | grep -i path", { timeout: 3000 }).toString();
  console.log("[startup] PATH env:", env.substring(0, 500));
} catch {}

export { ytDlpPath };
