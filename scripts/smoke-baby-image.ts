/**
 * Baby Image Generator Smoke Test
 *
 * Runs the 8 baby-image styles end-to-end against a live BabyBoogey instance.
 * For each style:
 *   1. POST /api/ai/generate
 *   2. Poll /api/ai/query until SUCCEEDED / FAILED / timeout
 *   3. Record duration, credits, result URL
 * Prints a summary table at the end. Exits non-zero if any style failed.
 *
 * Usage:
 *   pnpm smoke:baby-image                  # text-only, all 8 styles
 *   pnpm smoke:baby-image --style=chibi    # only chibi
 *   pnpm smoke:baby-image --image=asset://<id>   # use a reference photo
 *
 * Required env:
 *   APP_URL           e.g. http://localhost:3000
 *   SESSION_COOKIE    raw cookie header from a logged-in browser session
 *                     (copy from DevTools → Application → Cookies)
 */
import {
  BABY_IMAGE_DEFAULT_MODEL,
  BABY_IMAGE_PROVIDER,
  BABY_IMAGE_SCENE_IMAGE,
  BABY_IMAGE_SCENE_TEXT,
} from '@/shared/services/baby-image/config';
import { BABY_STYLE_IDS } from '@/shared/services/baby-image/styles';

type StyleId = (typeof BABY_STYLE_IDS)[number];

const APP_URL = (process.env.APP_URL || 'http://localhost:3000').replace(/\/$/, '');
const COOKIE = process.env.SESSION_COOKIE;

if (!COOKIE) {
  console.error('❌ SESSION_COOKIE env var is required.');
  console.error(
    '   Log in at your running BabyBoogey instance, open DevTools → Application → Cookies,'
  );
  console.error(
    '   copy the entire cookie string (all cookies for that domain) and export it:'
  );
  console.error('   export SESSION_COOKIE="better-auth.session_token=...; ..."');
  process.exit(1);
}

const POLL_INTERVAL_MS = 4000;
const POLL_TIMEOUT_MS = 180_000; // 3 minutes per image

// Parse CLI args
const argv = process.argv.slice(2);
function getArg(name: string): string | undefined {
  const prefix = `--${name}=`;
  const hit = argv.find((a) => a.startsWith(prefix));
  return hit ? hit.slice(prefix.length) : undefined;
}

const onlyStyle = getArg('style') as StyleId | undefined;
const imageRef = getArg('image'); // asset://<id>
const defaultPrompt = getArg('prompt') || 'a cheerful baby, studio portrait';

const stylesToRun = onlyStyle
  ? [onlyStyle]
  : (BABY_STYLE_IDS as readonly StyleId[]);

if (onlyStyle && !BABY_STYLE_IDS.includes(onlyStyle)) {
  console.error(`❌ Unknown style: ${onlyStyle}`);
  console.error(`   Available: ${BABY_STYLE_IDS.join(', ')}`);
  process.exit(1);
}

interface GenerateResponse {
  code: number;
  message?: string;
  data?: { taskId?: string };
}

interface QueryResponse {
  code: number;
  message?: string;
  data?: {
    aiTask?: {
      status?: string;
      taskResult?: string | null;
      costCredits?: number | null;
    };
  };
}

interface Result {
  style: StyleId;
  taskId?: string;
  status: 'SUCCEEDED' | 'FAILED' | 'TIMEOUT' | 'SUBMIT_FAILED';
  durationMs: number;
  creditsCharged?: number;
  resultUrl?: string;
  error?: string;
}

async function postJson<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${APP_URL}${path}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      cookie: COOKIE!,
    },
    body: JSON.stringify(body),
  });

  const text = await res.text();
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error(
      `Non-JSON response from ${path} (status ${res.status}): ${text.slice(0, 200)}`
    );
  }
}

async function runOne(style: StyleId): Promise<Result> {
  const started = Date.now();
  const hasImage = Boolean(imageRef);
  const scene = hasImage ? BABY_IMAGE_SCENE_IMAGE : BABY_IMAGE_SCENE_TEXT;

  const options: Record<string, unknown> = {
    styleId: style,
    aspect_ratio: '1:1',
  };
  if (hasImage) {
    options.image_input = [imageRef];
  }

  const payload = {
    mediaType: 'image',
    provider: BABY_IMAGE_PROVIDER,
    model: BABY_IMAGE_DEFAULT_MODEL,
    scene,
    prompt: defaultPrompt,
    options,
  };

  let taskId: string;
  try {
    const submit = await postJson<GenerateResponse>('/api/ai/generate', payload);
    if (submit.code !== 0 || !submit.data?.taskId) {
      return {
        style,
        status: 'SUBMIT_FAILED',
        durationMs: Date.now() - started,
        error: submit.message || 'no taskId returned',
      };
    }
    taskId = submit.data.taskId;
  } catch (err) {
    return {
      style,
      status: 'SUBMIT_FAILED',
      durationMs: Date.now() - started,
      error: err instanceof Error ? err.message : String(err),
    };
  }

  // Poll query
  while (Date.now() - started < POLL_TIMEOUT_MS) {
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));

    let q: QueryResponse;
    try {
      q = await postJson<QueryResponse>('/api/ai/query', { taskId });
    } catch (err) {
      // Transient network error — keep polling
      process.stderr.write(`  [${style}] query error, retrying: ${(err as Error).message}\n`);
      continue;
    }

    const status = q.data?.aiTask?.status;
    if (status === 'succeeded' || status === 'SUCCEEDED') {
      const taskResultRaw = q.data?.aiTask?.taskResult;
      let resultUrl: string | undefined;
      if (taskResultRaw) {
        try {
          const parsed = JSON.parse(taskResultRaw);
          const images = parsed?.images ?? parsed?.data ?? [];
          const first = Array.isArray(images) ? images[0] : undefined;
          resultUrl =
            typeof first === 'string'
              ? first
              : typeof first?.url === 'string'
                ? first.url
                : typeof first?.image_url === 'string'
                  ? first.image_url
                  : undefined;
        } catch {
          // ignore parse errors
        }
      }
      return {
        style,
        taskId,
        status: 'SUCCEEDED',
        durationMs: Date.now() - started,
        creditsCharged: q.data?.aiTask?.costCredits ?? undefined,
        resultUrl,
      };
    }

    if (status === 'failed' || status === 'FAILED') {
      return {
        style,
        taskId,
        status: 'FAILED',
        durationMs: Date.now() - started,
        creditsCharged: q.data?.aiTask?.costCredits ?? undefined,
        error: q.message || 'task reported FAILED',
      };
    }
  }

  return {
    style,
    taskId,
    status: 'TIMEOUT',
    durationMs: Date.now() - started,
    error: `exceeded ${POLL_TIMEOUT_MS}ms`,
  };
}

async function main() {
  console.log('='.repeat(80));
  console.log('BabyBoogey — Baby Image Smoke Test');
  console.log('='.repeat(80));
  console.log(`Target     : ${APP_URL}`);
  console.log(`Styles     : ${stylesToRun.join(', ')}`);
  console.log(`Scene      : ${imageRef ? 'baby-image-image' : 'baby-image-text'}`);
  console.log(`Prompt     : "${defaultPrompt}"`);
  console.log(`Image ref  : ${imageRef || '(none — text-only)'}`);
  console.log('');

  const results: Result[] = [];
  for (const style of stylesToRun) {
    process.stdout.write(`→ ${style} ... `);
    const r = await runOne(style);
    process.stdout.write(`${r.status} (${(r.durationMs / 1000).toFixed(1)}s)\n`);
    results.push(r);
  }

  console.log('');
  console.log('─'.repeat(80));
  console.log('Summary');
  console.log('─'.repeat(80));
  console.table(
    results.map((r) => ({
      style: r.style,
      status: r.status,
      seconds: (r.durationMs / 1000).toFixed(1),
      credits: r.creditsCharged ?? '-',
      taskId: r.taskId?.slice(0, 12) ?? '-',
      error: r.error?.slice(0, 60) ?? '',
    }))
  );

  console.log('');
  console.log('Result URLs:');
  for (const r of results) {
    if (r.resultUrl) {
      console.log(`  [${r.style}]  ${r.resultUrl}`);
    }
  }

  const failed = results.filter((r) => r.status !== 'SUCCEEDED');
  if (failed.length > 0) {
    console.log('');
    console.error(`❌ ${failed.length}/${results.length} styles did not succeed.`);
    process.exit(1);
  } else {
    console.log('');
    console.log(`✅ All ${results.length} styles succeeded. Verify images visually.`);
  }
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
