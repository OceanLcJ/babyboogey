import { respData, respErr } from '@/shared/lib/resp';
import { findChatById } from '@/shared/models/chat';
import {
  getChatMessages,
  getChatMessagesCount,
} from '@/shared/models/chat_message';
import { getUserInfo } from '@/shared/models/user';

export async function POST(req: Request) {
  try {
    const payload = await req.json();
    const chatId = payload.chatId;
    const page = payload.page || 1;
    const limit = payload.limit || 30;
    if (!chatId) {
      return respErr('chatId is required');
    }

    const user = await getUserInfo();
    if (!user) {
      return respErr('no auth, please sign in');
    }

    const chat = await findChatById(chatId);
    if (!chat || chat.userId !== user.id) {
      return respErr('chat not found');
    }

    const messages = await getChatMessages({
      chatId,
      page,
      limit,
    });
    const total = await getChatMessagesCount({
      chatId,
    });

    return respData({
      list: messages,
      total,
      page,
      limit,
      hasMore: page * limit < total,
    });
  } catch (e: UnsafeAny) {
    console.log('get chat messages failed:', e);
    return respErr(`get chat messages failed: ${e.message}`);
  }
}
