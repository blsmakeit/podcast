# MAKEIT.TECH Media Navigator — Usage Guide

A short guide for admins managing the platform.

---

## Accessing Admin Mode

1. Open the platform in your browser
2. Scroll to the footer → click **🔒 Admin** (far right)
3. Enter the password: `MIcompany2020`
4. A red banner appears at the top — you're in admin mode

To exit, click **🔓 Exit Admin** in the footer.

---

## Adding an Episode

1. In admin mode, click **+ Add Episode** (top of the page)
2. Enter the **episode title** and paste the **YouTube URL**
3. Choose your **Transcript Source**:
   - **Auto (YouTube)** — fetches the transcript automatically via Supadata (requires captions enabled)
   - **Import File** — paste a transcript exported from Adobe Premiere or any tool that generates timestamped text
4. Choose your **Analysis Mode**:
   - **Full analysis** — sends the complete transcript to Claude. Best for videos under 45 min
   - **Summarised** — samples evenly across the entire video. Recommended for videos over 45 min — prevents errors and preserves coverage of beginning, middle and end
5. Click **Extract** — the button becomes active only after Title, YouTube URL, Transcript Source and Analysis Mode are all selected. Wait a few seconds while the transcript is fetched and Claude analyses it.
6. The platform automatically fills in description, category, thumbnail and key moments
7. Review and edit anything if needed
8. Click **Add Episode**

The episode appears in the grid immediately.

---

## Importing a Transcript from Premiere (or any tool)

If your video has no captions on YouTube, or you want higher quality transcription with speaker identification, you can export the transcript from Adobe Premiere (or any tool) and import it directly:

1. In Adobe Premiere → open the **Text** panel → **Transcript** tab
2. Click the menu (⋯) → **Export transcript** → save as `.txt`
3. In the Add Episode modal → select **Import File** as Transcript Source
4. Paste the transcript text into the textarea
5. Select Analysis Mode and click **Extract**

Supported formats: `[MM:SS] text` with timestamps, or plain text without timestamps.

> For long recordings (over 45 min), always use **Summarised** mode to avoid errors.

---

## YouTube Video Requirements

| Requirement | Detail |
|-------------|--------|
| **Your video** | Must be published on your own YouTube channel |
| **Visibility** | Public or Unlisted — **Private videos will not work** |
| **Captions** | Required only if using Auto (YouTube) source — not needed when importing a transcript |
| **Chapters** | Add chapters to the video description for better key moments |

---

## Deleting an Episode

In admin mode, a **Delete** button appears on each episode card.

1. Click **Delete**
2. Confirm the prompt
3. The episode is removed immediately

---

## Key Moments Sidebar

On each episode page, the key moments panel is scrollable — scroll down with the mouse or trackpad to see all moments. A subtle scrollbar appears on the right side of the panel.

Clicking any key moment jumps the video directly to that timestamp.

---

## PCB — AI Search

Visitors can use the **PCB** search bar on the home page to find specific topics across all episodes. It uses Claude to find the exact timestamp where a topic is discussed.

The quality of PCB results depends on the key moments — the more specific the text, the better the results. Key moments are generated automatically during extraction and cover the full timeline of the episode.

---

**Password:** `MIcompany2020`
