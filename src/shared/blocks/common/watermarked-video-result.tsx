'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Download, Loader2 } from 'lucide-react';

import {
  inferExtensionFromMimeType,
  isDynamicWatermarkedVideo,
  renderWatermarkedVideoBlob,
} from '@/shared/lib/watermark';
import {
  DEFAULT_VIDEO_WATERMARK_OPACITY,
  DEFAULT_VIDEO_WATERMARK_TEXT,
} from '@/shared/lib/watermark-config';
import type {
  VideoWatermarkConfig,
  WatermarkedPlaybackState,
} from '@/shared/types/watermark';

interface WatermarkedVideoResultProps {
  videoUrl: string;
  downloadUrl?: string;
  thumbnailUrl?: string;
  watermark?: VideoWatermarkConfig;
  showDownload?: boolean;
  downloadLabel?: string;
  preparePreviewLabel?: string;
  retryPreviewLabel?: string;
  previewOnDemandLabel?: string;
  preparingPreviewLabel?: string;
  previewFailedLabel?: string;
  noticeLabel?: string;
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
  downloadUrl,
  thumbnailUrl,
  watermark,
  showDownload = true,
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
  const autoPrepareKeyRef = useRef<string | null>(null);
  const [playbackState, setPlaybackState] = useState<WatermarkedPlaybackState>({
    status: 'idle',
  });
  const playbackStateRef = useRef<WatermarkedPlaybackState>({ status: 'idle' });

  const dynamicWatermarked = isDynamicWatermarkedVideo(watermark);
  const resolvedDownloadUrl = downloadUrl || videoUrl;
  const watermarkText = watermark?.watermarkText;
  const watermarkOpacity = watermark?.watermarkOpacity;
  const watermarkIntervalSeconds = watermark?.watermarkIntervalSeconds;

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
          watermarkText,
          watermarkOpacity,
          watermarkIntervalSeconds,
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
    [
      dynamicWatermarked,
      videoUrl,
      watermarkIntervalSeconds,
      watermarkOpacity,
      watermarkText,
    ]
  );

  useEffect(() => {
    playbackStateRef.current = { status: 'idle' };
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

  useEffect(() => {
    if (!dynamicWatermarked || !videoUrl) {
      autoPrepareKeyRef.current = null;
      return;
    }

    const autoPrepareKey = [
      videoUrl,
      watermarkText || '',
      watermarkOpacity ?? '',
      watermarkIntervalSeconds ?? '',
    ].join('|');
    if (autoPrepareKeyRef.current === autoPrepareKey) {
      return;
    }

    autoPrepareKeyRef.current = autoPrepareKey;
    void prepareWatermarkedPlayback().catch(() => {});
  }, [
    dynamicWatermarked,
    prepareWatermarkedPlayback,
    videoUrl,
    watermarkIntervalSeconds,
    watermarkOpacity,
    watermarkText,
  ]);

  const handlePreparePreview = useCallback(() => {
    void prepareWatermarkedPlayback({
      forceRetry: playbackStateRef.current.status === 'error',
    }).catch(() => {});
  }, [prepareWatermarkedPlayback]);

  const handleDownload = useCallback(async () => {
    if (!resolvedDownloadUrl) {
      return;
    }

    if (!dynamicWatermarked) {
      triggerDownload(
        resolvedDownloadUrl,
        `video.${inferExtensionFromMimeType('video/mp4')}`
      );
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
  }, [dynamicWatermarked, prepareWatermarkedPlayback, resolvedDownloadUrl]);

  const playbackUrl = dynamicWatermarked
    ? playbackState.blobUrl || videoUrl
    : videoUrl;
  const canRenderVideo = Boolean(playbackUrl);

  return (
    <div className="flex flex-col gap-2">
      <div className="bg-muted relative flex h-40 w-72 items-center justify-center overflow-hidden rounded-md border">
        {canRenderVideo ? (
          <video
            src={playbackUrl}
            poster={thumbnailUrl || undefined}
            controls
            controlsList={
              dynamicWatermarked ? 'nodownload noremoteplayback' : undefined
            }
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
              className="max-w-[82%] truncate rounded-md border border-white/25 bg-black/60 px-2.5 py-1.5 text-xs font-bold tracking-[0.08em] text-white shadow-lg shadow-black/30 backdrop-blur-sm"
              style={{
                position: 'absolute',
                left: '5%',
                top: '12%',
                opacity:
                  watermark?.watermarkOpacity ??
                  DEFAULT_VIDEO_WATERMARK_OPACITY,
                animation: `bb-watermark-drift ${Math.max(
                  5,
                  (watermark?.watermarkIntervalSeconds ?? 3) * 4
                )}s linear infinite`,
              }}
            >
              {watermark?.watermarkText || DEFAULT_VIDEO_WATERMARK_TEXT}
            </div>
            <div
              className="max-w-[82%] truncate rounded-md border border-white/25 bg-black/60 px-2.5 py-1.5 text-xs font-bold tracking-[0.08em] text-white shadow-lg shadow-black/30 backdrop-blur-sm"
              style={{
                position: 'absolute',
                right: '6%',
                bottom: '12%',
                opacity:
                  watermark?.watermarkOpacity ??
                  DEFAULT_VIDEO_WATERMARK_OPACITY,
                animation: `bb-watermark-drift-reverse ${Math.max(
                  6,
                  (watermark?.watermarkIntervalSeconds ?? 3) * 5
                )}s linear infinite`,
              }}
            >
              {watermark?.watermarkText || DEFAULT_VIDEO_WATERMARK_TEXT}
            </div>
          </div>
        )}
      </div>

      {dynamicWatermarked && noticeLabel ? (
        <div className="rounded border border-amber-300/50 bg-amber-50 px-2 py-1 text-[11px] text-amber-900">
          {noticeLabel}
        </div>
      ) : null}

      {showDownload && dynamicWatermarked ? (
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
      ) : showDownload ? (
        <a
          href={resolvedDownloadUrl}
          download
          className="inline-flex w-fit items-center gap-1 rounded border px-2 py-1 text-xs hover:bg-black/5"
        >
          <Download className="h-3.5 w-3.5" />
          {downloadLabel}
        </a>
      ) : null}
    </div>
  );
}
