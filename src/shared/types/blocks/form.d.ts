import { Button } from './common';

type ValidationRule = {
  required?: boolean;
  min?: number;
  max?: number;
  message?: string;
  email?: boolean;
};

export interface FormField {
  name?: string;
  title?: string;
  type?:
    | 'text'
    | 'textarea'
    | 'number'
    | 'email'
    | 'password'
    | 'select'
    | 'url'
    | 'editor'
    | 'code_editor'
    | 'richtext_editor'
    | 'markdown_editor'
    | 'switch'
    | 'checkbox'
    | 'upload_image';
  placeholder?: string;
  group?: string;
  options?: {
    title: string;
    value: string;
  }[];
  value?: UnsafeAny;
  tip?: string;
  attributes?: Record<string, UnsafeAny>;
  validation?: ValidationRule;
  metadata?: Record<string, UnsafeAny>;
}

export interface FormSubmit {
  input?: FormField;
  button?: Button;
  action?: string;
  handler?: (
    data: FormData,
    passby?: UnsafeAny
  ) => Promise<
    | {
        status: 'success' | 'error';
        message: string;
        redirect_url?: string;
      }
    | undefined
    | void
  >;
}

export interface Form {
  title?: string;
  description?: string;
  fields: FormField[];
  data?: UnsafeAny;
  passby?: UnsafeAny;
  submit?: FormSubmit;
}
