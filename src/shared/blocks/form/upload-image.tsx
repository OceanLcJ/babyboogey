'use client';

import { useCallback, useMemo } from 'react';
import { ControllerRenderProps } from 'react-hook-form';

import { FormField } from '@/shared/types/blocks/form';

import {
  ImageUploader,
  ImageUploaderValue,
  MediaUploadPurpose,
  MediaUploadSource,
} from '../common';

interface UploadImageProps {
  field: FormField;
  formField: ControllerRenderProps<Record<string, unknown>, string>;
  data?: UnsafeAny;
  metadata?: Record<string, UnsafeAny>;
}

export function UploadImage({
  field,
  formField,
  data,
  metadata,
}: UploadImageProps) {
  const maxImages = metadata?.max || 1;
  const maxSizeMB = metadata?.maxSizeMB || 10;
  const allowMultiple = maxImages > 1;
  const purpose = (metadata?.purpose || 'reference_image') as MediaUploadPurpose;
  const source = (metadata?.source || 'upload') as MediaUploadSource;

  const previews = useMemo(() => {
    const value = formField.value;
    if (!value) return [];

    let urls: string[] = [];

    if (typeof value === 'string') {
      urls = value.includes(',') ? value.split(',').filter(Boolean) : [value];
    } else if (Array.isArray(value)) {
      urls = value;
    }

    return urls;
  }, [formField.value]);

  const handleChange = useCallback(
    (items: ImageUploaderValue[]) => {
      const uploadedUrls = items
        .filter((item) => item.status === 'uploaded' && item.url)
        .map((item) => item.url as string);

      if (uploadedUrls.length > 0) {
        formField.onChange(allowMultiple ? uploadedUrls : uploadedUrls[0]);
      } else {
        formField.onChange(allowMultiple ? [] : '');
      }
    },
    [formField, allowMultiple]
  );

  return (
    <ImageUploader
      allowMultiple={allowMultiple}
      maxImages={maxImages}
      maxSizeMB={maxSizeMB}
      emptyHint={field.placeholder}
      defaultPreviews={previews}
      purpose={purpose}
      source={source}
      onChange={handleChange}
    />
  );
}
