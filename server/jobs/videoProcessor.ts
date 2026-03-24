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

interface VideoJob {
  campaignId: number;
  sourceVideoPath: string;
  startSeconds: number;
  duration: number;
  episodeTitle: string;
  guestName: string;
  guestRole: string;
}

export const videoWorker = new Worker('video-processing', async (job: any) => {
  const { campaignId, sourceVideoPath, startSeconds, duration, episodeTitle, guestName, guestRole } = job.data as VideoJob;

  const outputDir = path.resolve(VIDEO_STORAGE_PATH);
  const rawClip = path.join(outputDir, `${campaignId}-raw.mp4`);
  const landscapeOutput = path.join(outputDir, `${campaignId}-landscape.mp4`);
  const portraitOutput = path.join(outputDir, `${campaignId}-portrait.mp4`);

  try {
    await storage.updateCampaign(campaignId, { teaserJobStatus: 'processing', teaserJobProgress: 5 });

    // Step 1: Trim 20-second clip
    await job.updateProgress(10);
    await new Promise<void>((resolve, reject) => {
      ffmpeg(sourceVideoPath)
        .seekInput(startSeconds)
        .duration(duration)
        .videoCodec('libx264')
        .audioCodec('aac')
        .output(rawClip)
        .on('end', () => resolve())
        .on('error', (err: Error) => reject(err))
        .run();
    });

    // Step 2: Add branded lower-third (landscape)
    await job.updateProgress(40);
    await storage.updateCampaign(campaignId, { teaserJobProgress: 40 });

    const titleText = episodeTitle.substring(0, 50).replace(/'/g, "\\'").replace(/:/g, '\\:');
    const guestText = `${guestName || ''}${guestRole ? ' | ' + guestRole : ''}`.substring(0, 60).replace(/'/g, "\\'").replace(/:/g, '\\:');

    await new Promise<void>((resolve, reject) => {
      ffmpeg(rawClip)
        .videoFilters([
          `drawbox=y=ih*0.85:color=black@0.75:width=iw:height=ih*0.15:t=fill`,
          `drawbox=y=ih*0.845:color=#D42B2B:width=iw:height=3:t=fill`,
          `drawtext=fontfile=${FONT_PATH}:text='MAKEITorBREAKIT':fontcolor=white:fontsize=22:x=20:y=h*0.87`,
          `drawtext=fontfile=${FONT_PATH}:text='${titleText}':fontcolor=white@0.9:fontsize=16:x=20:y=h*0.91`,
          `drawtext=fontfile=${FONT_PATH}:text='${guestText}':fontcolor=white@0.7:fontsize=13:x=20:y=h*0.95`,
        ])
        .output(landscapeOutput)
        .on('end', () => resolve())
        .on('error', (err: Error) => reject(err))
        .run();
    });

    // Step 3: Create vertical 9:16 version
    await job.updateProgress(70);
    await storage.updateCampaign(campaignId, { teaserJobProgress: 70 });

    await new Promise<void>((resolve, reject) => {
      ffmpeg(landscapeOutput)
        .complexFilter([
          '[0:v]scale=1080:1920,boxblur=20:5[bg]',
          '[0:v]scale=1080:607[fg]',
          '[bg][fg]overlay=0:656[out]',
        ])
        .map('[out]')
        .addOption('-map', '0:a')
        .output(portraitOutput)
        .on('end', () => resolve())
        .on('error', (err: Error) => reject(err))
        .run();
    });

    // Clean up raw clip
    if (fs.existsSync(rawClip)) fs.unlinkSync(rawClip);

    await job.updateProgress(100);

    const landscapeUrl = `/uploads/videos/${campaignId}-landscape.mp4`;
    const portraitUrl = `/uploads/videos/${campaignId}-portrait.mp4`;

    await storage.updateCampaign(campaignId, {
      teaserJobStatus: 'completed',
      teaserJobProgress: 100,
      teaserLandscapeUrl: landscapeUrl,
      teaserPortraitUrl: portraitUrl,
    });

    return { landscapeUrl, portraitUrl };
  } catch (error: any) {
    [rawClip, landscapeOutput, portraitOutput].forEach((f) => {
      if (fs.existsSync(f)) {
        try { fs.unlinkSync(f); } catch {}
      }
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
