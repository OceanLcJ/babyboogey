import type { VideoWatermarkType } from '@/shared/types/watermark';

export function normalizeWatermarkType(value?: string | null): VideoWatermarkType {
  return String(value || '').trim().toLowerCase() === 'dynamic_overlay'
    ? 'dynamic_overlay'
    : 'none';
}

export function isDynamicWatermarkedVideo(
  config?: { watermarkApplied?: boolean | null; watermarkType?: string | null } | null
) {
  return (
    Boolean(config?.watermarkApplied) &&
    normalizeWatermarkType(config?.watermarkType) === 'dynamic_overlay'
  );
}

export function inferExtensionFromMimeType(mimeType?: string) {
  const normalized = String(mimeType || '').toLowerCase();
  if (normalized.includes('mp4')) {
    return 'mp4';
  }
  if (normalized.includes('webm')) {
    return 'webm';
  }
  return 'mp4';
}

export function pickMediaRecorderMimeType() {
  if (typeof MediaRecorder === 'undefined') {
    return '';
  }

  const candidates = [
    'video/webm;codecs=vp9,opus',
    'video/webm;codecs=vp8,opus',
    'video/webm',
    'video/mp4',
  ];

  for (const candidate of candidates) {
    try {
      if (MediaRecorder.isTypeSupported(candidate)) {
        return candidate;
      }
    } catch {
      continue;
    }
  }

  return '';
}

type CaptureStreamVideoElement = HTMLVideoElement & {
  captureStream?: () => MediaStream;
  mozCaptureStream?: () => MediaStream;
};

export async function renderWatermarkedVideoBlob({
  videoUrl,
  watermarkText,
  watermarkOpacity,
  watermarkIntervalSeconds,
}: {
  videoUrl: string;
  watermarkText?: string;
  watermarkOpacity?: number;
  watermarkIntervalSeconds?: number;
}): Promise<{ blob: Blob; extension: string }> {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    throw new Error('watermark download is only supported in browser');
  }

  if (typeof MediaRecorder === 'undefined') {
    throw new Error('media recorder is not supported');
  }

  return new Promise((resolve, reject) => {
    const source = document.createElement('video');
    source.preload = 'auto';
    source.playsInline = true;
    source.crossOrigin = 'anonymous';
    source.src = videoUrl;
    source.style.position = 'fixed';
    source.style.left = '-10000px';
    source.style.width = '1px';
    source.style.height = '1px';
    source.style.opacity = '0';
    document.body.appendChild(source);

    let rafId: number | null = null;
    let settled = false;
    let recorder: MediaRecorder | null = null;
    let composedStream: MediaStream | null = null;
    const chunks: BlobPart[] = [];

    const timeoutId = window.setTimeout(() => {
      fail(new Error('watermark export timed out'));
    }, 60_000);

    const cleanup = () => {
      window.clearTimeout(timeoutId);
      if (rafId !== null) {
        cancelAnimationFrame(rafId);
      }
      if (recorder && recorder.state !== 'inactive') {
        recorder.stop();
      }
      if (composedStream) {
        composedStream.getTracks().forEach((track) => track.stop());
      }
      source.pause();
      source.removeAttribute('src');
      source.load();
      source.remove();
    };

    const fail = (error: unknown) => {
      if (settled) {
        return;
      }
      settled = true;
      cleanup();
      reject(error instanceof Error ? error : new Error('failed to export video'));
    };

    const succeed = (blob: Blob, extension: string) => {
      if (settled) {
        return;
      }
      settled = true;
      cleanup();
      resolve({ blob, extension });
    };

    source.onerror = () => fail(new Error('failed to load source video'));
    source.onloadedmetadata = () => {
      const width = source.videoWidth || 0;
      const height = source.videoHeight || 0;
      if (!width || !height) {
        fail(new Error('invalid source video size'));
        return;
      }

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext('2d');
      if (!context) {
        fail(new Error('canvas 2d context is unavailable'));
        return;
      }

      if (typeof canvas.captureStream !== 'function') {
        fail(new Error('captureStream is not supported'));
        return;
      }

      composedStream = canvas.captureStream(30);
      const captureVideo = source as CaptureStreamVideoElement;
      const captureFn =
        typeof captureVideo.captureStream === 'function'
          ? captureVideo.captureStream.bind(captureVideo)
          : typeof captureVideo.mozCaptureStream === 'function'
            ? captureVideo.mozCaptureStream.bind(captureVideo)
            : null;

      if (captureFn) {
        try {
          const sourceStream = captureFn();
          sourceStream
            .getAudioTracks()
            .forEach((track) => composedStream?.addTrack(track));
        } catch {
          // Continue without audio track if browser cannot capture it.
        }
      }

      const mimeType = pickMediaRecorderMimeType();
      try {
        recorder = mimeType
          ? new MediaRecorder(composedStream, { mimeType })
          : new MediaRecorder(composedStream);
      } catch (error) {
        fail(error);
        return;
      }

      recorder.ondataavailable = (event: BlobEvent) => {
        if (event.data && event.data.size > 0) {
          chunks.push(event.data);
        }
      };
      recorder.onerror = (event) => {
        fail((event as ErrorEvent).error || new Error('recording failed'));
      };
      recorder.onstop = () => {
        const finalType = recorder?.mimeType || mimeType || 'video/webm';
        const blob = new Blob(chunks, { type: finalType });
        if (!blob.size) {
          fail(new Error('empty watermark export'));
          return;
        }
        succeed(blob, inferExtensionFromMimeType(finalType));
      };

      const intervalSeconds = Math.max(1, watermarkIntervalSeconds || 3);
      const opacity = Math.min(0.9, Math.max(0.08, watermarkOpacity || 0.28));
      const displayText = (watermarkText || 'BabyBoogey').slice(0, 64);

      const drawOverlay = () => {
        if (settled) {
          return;
        }

        context.clearRect(0, 0, width, height);
        context.drawImage(source, 0, 0, width, height);

        const fontSize = Math.max(14, Math.round(Math.min(width, height) * 0.04));
        context.font = `600 ${fontSize}px sans-serif`;
        const horizontalPadding = Math.round(fontSize * 0.65);
        const verticalPadding = Math.round(fontSize * 0.45);
        const metrics = context.measureText(displayText);
        const boxWidth = Math.round(metrics.width + horizontalPadding * 2);
        const boxHeight = Math.round(fontSize + verticalPadding * 2);
        const safeMargin = 10;
        const cycle = (source.currentTime / intervalSeconds) * Math.PI * 2;

        const drawWatermarkAt = (
          baseX: number,
          baseY: number,
          driftX: number,
          driftY: number
        ) => {
          const x = Math.round(
            Math.max(
              safeMargin,
              Math.min(width - boxWidth - safeMargin, baseX + driftX)
            )
          );
          const yBottom = Math.round(
            Math.max(
              boxHeight + safeMargin,
              Math.min(height - safeMargin, baseY + driftY)
            )
          );

          context.save();
          context.globalAlpha = opacity;
          context.fillStyle = 'rgba(0, 0, 0, 0.5)';
          context.fillRect(x, yBottom - boxHeight, boxWidth, boxHeight);
          context.fillStyle = 'rgba(255, 255, 255, 0.95)';
          context.textBaseline = 'alphabetic';
          context.fillText(
            displayText,
            x + horizontalPadding,
            yBottom - verticalPadding
          );
          context.restore();
        };

        drawWatermarkAt(
          width * 0.07,
          height * 0.18,
          Math.sin(cycle) * width * 0.08,
          Math.cos(cycle * 0.8) * height * 0.06
        );
        drawWatermarkAt(
          width * 0.68,
          height * 0.88,
          Math.cos(cycle * 1.1) * width * 0.09,
          Math.sin(cycle * 0.9) * height * 0.07
        );

        if (source.ended) {
          if (recorder && recorder.state !== 'inactive') {
            recorder.stop();
          }
          return;
        }
        rafId = requestAnimationFrame(drawOverlay);
      };

      source.onended = () => {
        if (recorder && recorder.state !== 'inactive') {
          recorder.stop();
        }
      };

      try {
        recorder.start(250);
      } catch (error) {
        fail(error);
        return;
      }

      source
        .play()
        .then(() => {
          rafId = requestAnimationFrame(drawOverlay);
        })
        .catch((error) => {
          fail(error);
        });
    };
  });
}
