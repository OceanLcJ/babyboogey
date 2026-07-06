import { respData, respErr, safeErrorMessage } from '@/shared/lib/resp';
import { getPublicConfigs } from '@/shared/models/config';

export async function POST(req: Request) {
  try {
    const configs = await getPublicConfigs();

    return respData(configs);
  } catch (e: UnsafeAny) {
    return respErr(safeErrorMessage(e, 'get configs failed'));
  }
}
