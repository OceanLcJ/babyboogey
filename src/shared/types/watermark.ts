export type VideoWatermarkType = 'none' | 'dynamic_overlay';

export interface VideoWatermarkConfig {
  watermarkApplied?: boolean;
  watermarkType?: VideoWatermarkType;
  watermarkOpacity?: number;
  watermarkIntervalSeconds?: number;
  watermarkText?: string;
}

export interface WatermarkedPlaybackState {
  status: 'idle' | 'processing' | 'ready' | 'error';
  blobUrl?: string;
  extension?: string;
}

