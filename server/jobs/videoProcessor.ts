import ffmpeg from 'fluent-ffmpeg';
import ffmpegInstaller from '@ffmpeg-installer/ffmpeg';
import { Worker } from 'bullmq';
import path from 'path';
import fs from 'fs';
import { redisOpts } from './queue.js';
import { storage } from '../storage.js';

ffmpeg.setFfmpegPath(ffmpegInstaller.path);

const VIDEO_STORAGE_PATH = process.env.VIDEO_STORAGE_PATH || './uploads/videos';
const FONT_PATH = path.resolve('./server/assets/fonts/LiberationSans-Bold.ttf');
const BRAND_RED = '#D42B2B';

interface VideoJob {
  campaignId: number;
  sourceVideoPath: string;
  startSeconds: number;
  duration: number;
  episodeTitle: string;
  guestName: string;
  guestRole: string;
}

function runFfmpeg(cmd: ffmpeg.FfmpegCommand): Promise<void> {
  return new Promise((resolve, reject) => {
    cmd.on('end', () => resolve()).on('error', (err: Error) => reject(err)).run();
  });
}

export const videoWorker = new Worker('video-processing', async (job: any) => {
  const { campaignId, sourceVideoPath, startSeconds, duration, episodeTitle, guestName, guestRole } = job.data as VideoJob;

  console.log('[VideoWorker] Job received:', { campaignId, sourceVideoPath, startSeconds, duration });

  if (!fs.existsSync(FONT_PATH)) {
    console.error('[VideoWorker] FONT NOT FOUND at:', FONT_PATH);
    throw new Error(`Font file not found: ${FONT_PATH}`);
  }
  console.log('[VideoWorker] Font found:', FONT_PATH);

  const outputDir = path.resolve(VIDEO_STORAGE_PATH);
  fs.mkdirSync(outputDir, { recursive: true });

  const rawClip       = path.join(outputDir, `${campaignId}-raw.mp4`);
  const introClip     = path.join(outputDir, `${campaignId}-intro.mp4`);
  const outroClip     = path.join(outputDir, `${campaignId}-outro.mp4`);
  const concatList    = path.join(outputDir, `${campaignId}-concat.txt`);
  const contentClip   = path.join(outputDir, `${campaignId}-content.mp4`);
  const landscapeOutput = path.join(outputDir, `${campaignId}-landscape.mp4`);
  const portraitOutput  = path.join(outputDir, `${campaignId}-portrait.mp4`);

  const tempFiles = [rawClip, introClip, outroClip, concatList, contentClip];

  try {
    await storage.updateCampaign(campaignId, { teaserJobStatus: 'processing', teaserJobProgress: 5 });

    // ── Step 1: Check source file ─────────────────────────────────────────
    await job.updateProgress(8);
    console.log('[VideoWorker] Step 1: checking source file exists:', sourceVideoPath);
    console.log('[VideoWorker] Source file exists:', fs.existsSync(sourceVideoPath));

    // ── Step 2: Trim 20-second raw clip ──────────────────────────────────
    await job.updateProgress(10);
    console.log('[VideoWorker] Step 2: trimming raw clip...');
    await runFfmpeg(
      ffmpeg(sourceVideoPath)
        .seekInput(startSeconds)
        .duration(duration)
        .videoCodec('libx264')
        .audioCodec('aac')
        .outputOptions(['-pix_fmt', 'yuv420p'])
        .output(rawClip)
    );
    console.log('[VideoWorker] Step 2 complete: raw clip trimmed');

    // ── Step 3: Create 2s branded intro card ────────────────────────────
    await job.updateProgress(25);
    await storage.updateCampaign(campaignId, { teaserJobProgress: 25 });
    console.log('[VideoWorker] Step 3: generating intro...');

    const titleSafe = episodeTitle.substring(0, 45).replace(/'/g, "\\'").replace(/:/g, '\\:');
    const guestSafe = `${guestName || ''}${guestRole ? ' | ' + guestRole : ''}`.substring(0, 55).replace(/'/g, "\\'").replace(/:/g, '\\:');

    await runFfmpeg(
      ffmpeg()
        .input('color=c=black:s=1920x1080:r=25:d=2')
        .inputFormat('lavfi')
        .input('anullsrc=channel_layout=stereo:sample_rate=44100')
        .inputFormat('lavfi')
        .complexFilter([
          `[0:v]drawbox=x=0:y=0:w=1920:h=6:color=#D42B2B@1:t=fill[v1]`,
          `[v1]drawtext=fontfile=${FONT_PATH}:text='MAKEITorBREAKIT':fontcolor=white:fontsize=52:x=(w-text_w)/2:y=h*0.35[v2]`,
          `[v2]drawbox=x=iw*0.35:y=ih*0.52:w=iw*0.30:h=3:color=#D42B2B@1:t=fill[v3]`,
          `[v3]drawtext=fontfile=${FONT_PATH}:text='${titleSafe}':fontcolor=white@0.85:fontsize=28:x=(w-text_w)/2:y=h*0.58[v4]`,
          `[v4]drawtext=fontfile=${FONT_PATH}:text='${guestSafe}':fontcolor=white@0.65:fontsize=22:x=(w-text_w)/2:y=h*0.66[vout]`,
        ])
        .outputOptions([
          '-map', '[vout]',
          '-map', '1:a',
          '-t', '2',
          '-c:v', 'libx264',
          '-c:a', 'aac',
          '-pix_fmt', 'yuv420p',
          '-shortest',
        ])
        .output(introClip)
    );
    console.log('[VideoWorker] Step 3 complete: intro generated');

    // ── Step 4: Create 3s branded outro card ────────────────────────────
    await job.updateProgress(40);
    await storage.updateCampaign(campaignId, { teaserJobProgress: 40 });
    console.log('[VideoWorker] Step 4: generating outro...');

    await runFfmpeg(
      ffmpeg()
        .input('color=c=black:s=1920x1080:r=25:d=3')
        .inputFormat('lavfi')
        .input('anullsrc=channel_layout=stereo:sample_rate=44100')
        .inputFormat('lavfi')
        .complexFilter([
          `[0:v]drawbox=x=0:y=1074:w=1920:h=6:color=#D42B2B@1:t=fill[v1]`,
          `[v1]drawtext=fontfile=${FONT_PATH}:text='Vê o episódio completo':fontcolor=white@0.7:fontsize=30:x=(w-text_w)/2:y=h*0.38[v2]`,
          `[v2]drawtext=fontfile=${FONT_PATH}:text='MAKEIT.TECH':fontcolor=white:fontsize=64:x=(w-text_w)/2:y=h*0.48[v3]`,
          `[v3]drawbox=x=iw*0.40:y=ih*0.60:w=iw*0.20:h=4:color=#D42B2B@1:t=fill[vout]`,
        ])
        .outputOptions([
          '-map', '[vout]',
          '-map', '1:a',
          '-t', '3',
          '-c:v', 'libx264',
          '-c:a', 'aac',
          '-pix_fmt', 'yuv420p',
          '-shortest',
        ])
        .output(outroClip)
    );
    console.log('[VideoWorker] Step 4 complete: outro generated');

    // ── Step 5: Concatenate intro + raw clip + outro ─────────────────────
    await job.updateProgress(55);
    await storage.updateCampaign(campaignId, { teaserJobProgress: 55 });
    console.log('[VideoWorker] Step 5: concatenating clips...');

    fs.writeFileSync(
      concatList,
      `file '${introClip}'\nfile '${rawClip}'\nfile '${outroClip}'\n`
    );

    await runFfmpeg(
      ffmpeg()
        .input(concatList)
        .inputOptions(['-f', 'concat', '-safe', '0'])
        .outputOptions(['-c', 'copy'])
        .output(contentClip)
    );
    console.log('[VideoWorker] Step 5 complete: clips concatenated');

    // ── Step 6: Add lower-third brand overlay → landscape ───────────────
    await job.updateProgress(70);
    await storage.updateCampaign(campaignId, { teaserJobProgress: 70 });
    console.log('[VideoWorker] Step 6: adding lower-third overlay (landscape)...');

    const titleLower = episodeTitle.substring(0, 50).replace(/'/g, "\\'").replace(/:/g, '\\:');
    const guestLower = `${guestName || ''}${guestRole ? ' | ' + guestRole : ''}`.substring(0, 60).replace(/'/g, "\\'").replace(/:/g, '\\:');

    await runFfmpeg(
      ffmpeg(contentClip)
        .complexFilter([
          `[0:v]drawbox=y=ih*0.85:color=black@0.75:width=iw:height=ih*0.15:t=fill[v1]`,
          `[v1]drawbox=y=ih*0.845:color=${BRAND_RED}:width=iw:height=3:t=fill[v2]`,
          `[v2]drawtext=fontfile=${FONT_PATH}:text='MAKEITorBREAKIT':fontcolor=white:fontsize=22:x=20:y=h*0.87[v3]`,
          `[v3]drawtext=fontfile=${FONT_PATH}:text='${titleLower}':fontcolor=white@0.9:fontsize=16:x=20:y=h*0.91[v4]`,
          `[v4]drawtext=fontfile=${FONT_PATH}:text='${guestLower}':fontcolor=white@0.7:fontsize=13:x=20:y=h*0.95[vout]`,
        ])
        .outputOptions([
          '-map', '[vout]',
          '-map', '0:a',
          '-c:v', 'libx264',
          '-c:a', 'aac',
          '-pix_fmt', 'yuv420p',
        ])
        .output(landscapeOutput)
    );
    console.log('[VideoWorker] Step 6 complete: landscape output ready');

    // ── Step 7: Create portrait 9:16 version ────────────────────────────
    await job.updateProgress(85);
    await storage.updateCampaign(campaignId, { teaserJobProgress: 85 });
    console.log('[VideoWorker] Step 7: creating portrait 9:16 version...');

    await runFfmpeg(
      ffmpeg(landscapeOutput)
        .complexFilter([
          // Background: scale to fill 1080x1920 with crop (no stretch)
          '[0:v]scale=1080:1920:force_original_aspect_ratio=increase,' +
          'crop=1080:1920,boxblur=30:5[bg]',
          // Foreground: scale landscape to fit 1080px wide, keep aspect ratio
          '[0:v]scale=1080:-2[fg]',
          // Overlay foreground centred vertically on background
          '[bg][fg]overlay=x=0:y=(H-h)/2[vout]',
        ])
        .outputOptions([
          '-map', '[vout]',
          '-map', '0:a',
          '-c:v', 'libx264',
          '-c:a', 'aac',
          '-pix_fmt', 'yuv420p',
        ])
        .output(portraitOutput)
    );
    console.log('[VideoWorker] Step 7 complete: portrait output ready');

    // Clean up temp files
    console.log('[VideoWorker] Cleaning up temp files...');
    tempFiles.forEach((f) => { try { if (fs.existsSync(f)) fs.unlinkSync(f); } catch {} });

    await job.updateProgress(100);

    const landscapeUrl = `/uploads/videos/${campaignId}-landscape.mp4`;
    const portraitUrl  = `/uploads/videos/${campaignId}-portrait.mp4`;

    await storage.updateCampaign(campaignId, {
      teaserJobStatus: 'completed',
      teaserJobProgress: 100,
      teaserLandscapeUrl: landscapeUrl,
      teaserPortraitUrl: portraitUrl,
    });

    return { landscapeUrl, portraitUrl };
  } catch (error: any) {
    console.error('[VideoWorker] Job failed:', {
      campaignId,
      error: error?.message,
      stack: error?.stack,
      code: error?.code,
    });

    // Clean up all files on error
    [...tempFiles, landscapeOutput, portraitOutput].forEach((f) => {
      try { if (fs.existsSync(f)) fs.unlinkSync(f); } catch {}
    });

    await storage.updateCampaign(campaignId, {
      teaserJobStatus: 'failed',
      teaserJobError: error?.message ?? 'Unknown error',
    });

    throw error;
  }
}, { connection: redisOpts });

// Suppress Redis connection errors so the rest of the server keeps running
// when Redis is not available (e.g. local dev without Redis)
videoWorker.on('error', (err) => {
  console.warn('[VideoWorker] Redis error (video teaser generation unavailable):', err.message);
});
