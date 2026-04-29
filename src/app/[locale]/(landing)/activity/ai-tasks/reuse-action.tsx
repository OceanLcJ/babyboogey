'use client';

import { RefreshCw, Sparkles } from 'lucide-react';

import { useRouter } from '@/core/i18n/navigation';
import {
  writeAITaskReuseHandoff,
  type AITaskReuseHandoffDraft,
} from '@/shared/lib/ai-task-reuse-handoff';
import { cn } from '@/shared/lib/utils';

type AITaskReuseActionProps = {
  payload: AITaskReuseHandoffDraft;
  targetHref: '/ai-baby-image-generator' | '/ai-video-generator';
  label: string;
  intent: 'reuse' | 'retry';
  className?: string;
};

export function AITaskReuseAction({
  payload,
  targetHref,
  label,
  intent,
  className,
}: AITaskReuseActionProps) {
  const router = useRouter();
  const Icon = intent === 'retry' ? RefreshCw : Sparkles;

  return (
    <button
      type="button"
      data-testid="ai-task-reuse-action"
      data-media-type={payload.mediaType}
      data-intent={intent}
      data-task-id={payload.taskId}
      onClick={() => {
        writeAITaskReuseHandoff(payload);
        router.push(targetHref);
      }}
      className={cn(
        'bg-foreground text-background hover:bg-foreground/90 inline-flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors',
        className
      )}
    >
      <Icon className="h-4 w-4" />
      {label}
    </button>
  );
}
