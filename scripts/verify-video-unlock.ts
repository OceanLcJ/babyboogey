import assert from 'node:assert/strict';

import {
  buildVideoUnlockCheckoutMetadata,
  extractFirstVideoAssetIdFromTaskInfo,
  isVideoUnlockProductId,
  VIDEO_UNLOCK_PRODUCT_ID,
} from '../src/shared/services/video-unlock';

assert.equal(isVideoUnlockProductId(VIDEO_UNLOCK_PRODUCT_ID), true);
assert.equal(isVideoUnlockProductId('starter'), false);

assert.deepEqual(
  buildVideoUnlockCheckoutMetadata({
    clientMetadata: {
      task_id: 'client-task',
      asset_id: 'client-asset',
      affonso_referral: 'ref_123',
    },
    taskId: 'task_1',
    assetId: 'asset_1',
  }),
  {
    task_id: 'task_1',
    asset_id: 'asset_1',
    intent: 'video_unlock',
    affonso_referral: 'ref_123',
  }
);

assert.equal(
  extractFirstVideoAssetIdFromTaskInfo(
    JSON.stringify({
      videos: [{ videoUrl: 'asset://asset_from_video_url' }],
    })
  ),
  'asset_from_video_url'
);

assert.equal(
  extractFirstVideoAssetIdFromTaskInfo(
    JSON.stringify({
      videos: [
        {
          videoUrl:
            'https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4',
          assetId: 'asset_from_explicit_field',
        },
      ],
    })
  ),
  'asset_from_explicit_field'
);

assert.equal(
  extractFirstVideoAssetIdFromTaskInfo(
    JSON.stringify({
      output: 'asset://asset_from_output',
    })
  ),
  'asset_from_output'
);

assert.equal(extractFirstVideoAssetIdFromTaskInfo('{broken'), null);

console.log('video unlock verification passed');
