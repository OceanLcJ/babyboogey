'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Download, Loader2 } from 'lucide-react';

type WatermarkType = 'none' | 'dynamic_overlay';

interface VideoWatermarkConfig {
  watermarkApplied?: boolean;
  watermarkType?: WatermarkType;
  watermarkOpacity?: number;
  watermarkIntervalSeconds?: number;
  watermarkText?: string;
}

interface WatermarkedVideoResultProps {
  videoUrl: string;
  thumbnailUrl?: string;
  watermark?: VideoWatermarkConfig;
  downloadLabel?: string;
  preparePreviewLabel?: string;
  retryPreviewLabel?: string;
  previewOnDemandLabel?: string;
  preparingPreviewLabel?: string;
  previewFailedLabel?: string;
  noticeLabel?: string;
}

interface WatermarkedPlaybackState {
  status: 'idle' | 'processing' | 'ready' | 'error';
  blobUrl?: string;
  extension?: string;
}

type CaptureStreamVideoElement = HTMLVideoElement & {
  captureStream?: () => MediaStream;
  mozCaptureStream?: () => MediaStream;
};

function normalizeWatermarkType(value?: string | null): WatermarkType {
  return String(value || '').trim().toLowerCase() === 'dynamic_overlay'
    ? 'dynamic_overlay'
    : 'none';
}

function isDynamicWatermarkedVideo(config?: VideoWatermarkConfig) {
  return (
    Boolean(config?.watermarkApplied) &&
    normalizeWatermarkType(config?.watermarkType) === 'dynamic_overlay'
  );
}

function inferExtensionFromMimeType(mimeType?: string) {
  const normalized = String(mimeType || '').toLowerCase();
  if (normalized.includes('mp4')) {
    return 'mp4';
  }
  if (normalized.includes('webm')) {
    return 'webm';
  }
  return 'mp4';
}

function pickMediaRecorderMimeType() {
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

async function renderWatermarkedVideoBlob({
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

    const cleanup = () => {
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

function triggerDownload(url: string, filename: string) {
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

export function WatermarkedVideoResult({
  videoUrl,
  thumbnailUrl,
  watermark,
  downloadLabel = 'Download',
  preparePreviewLabel = 'Prepare protected preview',
  retryPreviewLabel = 'Retry preview',
  previewOnDemandLabel = 'Preview is generated on demand',
  preparingPreviewLabel = 'Preparing protected preview...',
  previewFailedLabel = 'Protected preview failed',
  noticeLabel,
}: WatermarkedVideoResultProps) {
  const isAliveRef = useRef(true);
  const renderInFlightRef = useRef(false);
  const [playbackState, setPlaybackState] = useState<WatermarkedPlaybackState>({
    status: 'idle',
  });
  const playbackStateRef = useRef<WatermarkedPlaybackState>({ status: 'idle' });

  const dynamicWatermarked = isDynamicWatermarkedVideo(watermark);

  useEffect(() => {
    playbackStateRef.current = playbackState;
  }, [playbackState]);

  useEffect(() => {
    isAliveRef.current = true;
    return () => {
      isAliveRef.current = false;
      if (playbackStateRef.current.blobUrl) {
        URL.revokeObjectURL(playbackStateRef.current.blobUrl);
      }
    };
  }, []);

  const prepareWatermarkedPlayback = useCallback(
    async ({ forceRetry = false }: { forceRetry?: boolean } = {}) => {
      if (!dynamicWatermarked || !videoUrl) {
        return null;
      }

      const existing = playbackStateRef.current;
      if (existing.status === 'ready' && existing.blobUrl) {
        return {
          blobUrl: existing.blobUrl,
          extension: existing.extension || 'mp4',
        };
      }
      if (existing.status === 'processing') {
        return null;
      }
      if (existing.status === 'error' && !forceRetry) {
        return null;
      }
      if (renderInFlightRef.current) {
        return null;
      }

      renderInFlightRef.current = true;
      setPlaybackState({ status: 'processing' });

      try {
        const rendered = await renderWatermarkedVideoBlob({
          videoUrl,
          watermarkText: watermark?.watermarkText,
          watermarkOpacity: watermark?.watermarkOpacity,
          watermarkIntervalSeconds: watermark?.watermarkIntervalSeconds,
        });
        const blobUrl = URL.createObjectURL(rendered.blob);

        if (!isAliveRef.current) {
          URL.revokeObjectURL(blobUrl);
          return null;
        }

        setPlaybackState((prev) => {
          if (prev.blobUrl && prev.blobUrl !== blobUrl) {
            URL.revokeObjectURL(prev.blobUrl);
          }
          return {
            status: 'ready',
            blobUrl,
            extension: rendered.extension,
          };
        });

        return {
          blobUrl,
          extension: rendered.extension,
        };
      } catch (error) {
        if (isAliveRef.current) {
          setPlaybackState((prev) => {
            if (prev.blobUrl) {
              URL.revokeObjectURL(prev.blobUrl);
            }
            return { status: 'error' };
          });
        }
        throw error;
      } finally {
        renderInFlightRef.current = false;
      }
    },
    [dynamicWatermarked, videoUrl, watermark]
  );

  useEffect(() => {
    setPlaybackState((prev) => {
      if (prev.status === 'idle' && !prev.blobUrl) {
        return prev;
      }
      if (prev.blobUrl) {
        URL.revokeObjectURL(prev.blobUrl);
      }
      return { status: 'idle' };
    });
  }, [
    dynamicWatermarked,
    videoUrl,
    watermark?.watermarkApplied,
    watermark?.watermarkType,
    watermark?.watermarkOpacity,
    watermark?.watermarkIntervalSeconds,
    watermark?.watermarkText,
  ]);

  const handlePreparePreview = useCallback(() => {
    void prepareWatermarkedPlayback({
      forceRetry: playbackStateRef.current.status === 'error',
    }).catch(() => {});
  }, [prepareWatermarkedPlayback]);

  const handleDownload = useCallback(async () => {
    if (!videoUrl) {
      return;
    }

    if (!dynamicWatermarked) {
      triggerDownload(videoUrl, `video.${inferExtensionFromMimeType('video/mp4')}`);
      return;
    }

    const prepared =
      (await prepareWatermarkedPlayback({ forceRetry: true })) ||
      (() => {
        const existing = playbackStateRef.current;
        if (!existing.blobUrl) {
          return null;
        }
        return {
          blobUrl: existing.blobUrl,
          extension: existing.extension || 'mp4',
        };
      })();

    if (!prepared?.blobUrl) {
      return;
    }

    triggerDownload(prepared.blobUrl, `video.${prepared.extension || 'mp4'}`);
  }, [dynamicWatermarked, prepareWatermarkedPlayback, videoUrl]);

  const playbackUrl = dynamicWatermarked ? playbackState.blobUrl || '' : videoUrl;
  const canRenderVideo = Boolean(playbackUrl);

  return (
    <div className="flex flex-col gap-2">
      <div className="bg-muted relative flex h-40 w-72 items-center justify-center overflow-hidden rounded-md border">
        {canRenderVideo ? (
          <video
            src={playbackUrl}
            poster={thumbnailUrl || undefined}
            controls
            controlsList={dynamicWatermarked ? 'nodownload noremoteplayback' : undefined}
            disablePictureInPicture={dynamicWatermarked}
            className="h-40 w-72 rounded-md border bg-black/70 object-cover"
            preload="metadata"
            onContextMenu={
              dynamicWatermarked
                ? (event) => {
                    event.preventDefault();
                  }
                : undefined
            }
          />
        ) : (
          <div className="text-muted-foreground flex flex-col items-center gap-2 px-3 text-center text-xs">
            {playbackState.status === 'processing' ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>{preparingPreviewLabel}</span>
              </>
            ) : (
              <>
                <span>
                  {playbackState.status === 'error'
                    ? previewFailedLabel
                    : previewOnDemandLabel}
                </span>
                {dynamicWatermarked ? (
                  <button
                    type="button"
                    onClick={handlePreparePreview}
                    className="inline-flex items-center gap-1 rounded border px-2 py-1 text-[11px] hover:bg-black/5"
                  >
                    {playbackState.status === 'error'
                      ? retryPreviewLabel
                      : preparePreviewLabel}
                  </button>
                ) : null}
              </>
            )}
          </div>
        )}

        {dynamicWatermarked && canRenderVideo && (
          <div className="pointer-events-none absolute inset-0 overflow-hidden">
            <div
              className="rounded bg-black/20 px-2 py-1 text-[11px] font-semibold tracking-wide text-white/90 backdrop-blur-sm"
              style={{
                position: 'absolute',
                left: '5%',
                top: '12%',
                opacity: watermark?.watermarkOpacity ?? 0.28,
                animation: `bb-watermark-drift ${Math.max(
                  5,
                  (watermark?.watermarkIntervalSeconds ?? 3) * 4
                )}s linear infinite`,
              }}
            >
              {watermark?.watermarkText || 'BabyBoogey'}
            </div>
            <div
              className="rounded bg-black/20 px-2 py-1 text-[11px] font-semibold tracking-wide text-white/90 backdrop-blur-sm"
              style={{
                position: 'absolute',
                right: '6%',
                bottom: '12%',
                opacity: watermark?.watermarkOpacity ?? 0.28,
                animation: `bb-watermark-drift-reverse ${Math.max(
                  6,
                  (watermark?.watermarkIntervalSeconds ?? 3) * 5
                )}s linear infinite`,
              }}
            >
              {watermark?.watermarkText || 'BabyBoogey'}
            </div>
          </div>
        )}
      </div>

      {dynamicWatermarked && noticeLabel ? (
        <div className="rounded border border-amber-300/50 bg-amber-50 px-2 py-1 text-[11px] text-amber-900">
          {noticeLabel}
        </div>
      ) : null}

      {dynamicWatermarked ? (
        <button
          type="button"
          onClick={() => {
            void handleDownload();
          }}
          disabled={playbackState.status === 'processing'}
          className="inline-flex w-fit items-center gap-1 rounded border px-2 py-1 text-xs hover:bg-black/5 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {playbackState.status === 'processing' ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Download className="h-3.5 w-3.5" />
          )}
          {downloadLabel}
        </button>
      ) : (
        <a
          href={videoUrl}
          download
          className="inline-flex w-fit items-center gap-1 rounded border px-2 py-1 text-xs hover:bg-black/5"
        >
          <Download className="h-3.5 w-3.5" />
          {downloadLabel}
        </a>
      )}
    </div>
  );
}
