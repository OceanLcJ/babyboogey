export function respData(data: UnsafeAny) {
  return respJson(0, 'ok', data || []);
}

export function respOk() {
  return respJson(0, 'ok');
}

export function respErr(message: string) {
  return respJson(-1, message);
}

// Logs the full error server-side and returns a client-safe message.
// Internal exception details are never leaked to clients in production.
export function safeErrorMessage(e: unknown, fallback: string): string {
  const detail = e instanceof Error ? e.message : String(e);
  console.error('[api]', fallback, e);
  return process.env.NODE_ENV === 'production' ? fallback : detail;
}

export function respJson(code: number, message: string, data?: UnsafeAny) {
  const json = {
    code: code,
    message: message,
    data: data,
  };
  if (data) {
    json['data'] = data;
  }

  return Response.json(json);
}
