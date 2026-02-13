export function respData(data: UnsafeAny) {
  return respJson(0, 'ok', data || []);
}

export function respOk() {
  return respJson(0, 'ok');
}

export function respErr(message: string) {
  return respJson(-1, message);
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
