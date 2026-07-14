import { NextResponse } from 'next/server';

import { requireRole, toErrorResponse } from '@/lib/auth/account';
import { queueMatrixTextMessage, MatrixSendError } from '@/lib/matrix/send';
import {
  checkRateLimit,
  rateLimitResponse,
  RATE_LIMITS,
} from '@/lib/rate-limit';
import {
  sendMessageToConversation,
  SendMessageError,
} from '@/lib/whatsapp/send-message';

/** Unified dashboard send endpoint. Transport is selected by conversation. */
export async function POST(request: Request) {
  try {
    const ctx = await requireRole('agent');
    const limit = await checkRateLimit(`send:${ctx.userId}`, RATE_LIMITS.send);
    if (!limit.success) return rateLimitResponse(limit);
    const body = (await request.json().catch(() => null)) as Record<
      string,
      unknown
    > | null;
    if (!body || typeof body.conversation_id !== 'string') {
      return NextResponse.json(
        { error: 'conversation_id is required' },
        { status: 400 }
      );
    }

    const { data: conversation } = await ctx.supabase
      .from('conversations')
      .select('channel, transport')
      .eq('id', body.conversation_id)
      .eq('account_id', ctx.accountId)
      .maybeSingle();
    if (!conversation) {
      return NextResponse.json(
        { error: 'Conversation not found' },
        { status: 404 }
      );
    }

    if (conversation.transport === 'matrix') {
      if (
        body.message_type !== 'text' ||
        typeof body.content_text !== 'string'
      ) {
        return NextResponse.json(
          {
            error:
              'Matrix-routed conversations currently accept text messages only',
          },
          { status: 400 }
        );
      }
      const result = await queueMatrixTextMessage(
        ctx.supabase,
        ctx.accountId,
        ctx.userId,
        body.conversation_id,
        body.content_text
      );
      return NextResponse.json({
        success: true,
        message_id: result.messageId,
        status: result.status,
      });
    }

    if (conversation.transport && conversation.transport !== 'native') {
      return NextResponse.json(
        { error: `Unsupported messaging transport: ${conversation.transport}` },
        { status: 400 }
      );
    }

    const result = await sendMessageToConversation(
      ctx.supabase,
      ctx.accountId,
      {
        conversationId: body.conversation_id,
        messageType:
          typeof body.message_type === 'string' ? body.message_type : '',
        contentText:
          typeof body.content_text === 'string' ? body.content_text : null,
        mediaUrl: typeof body.media_url === 'string' ? body.media_url : null,
        filename: typeof body.filename === 'string' ? body.filename : null,
        templateName:
          typeof body.template_name === 'string' ? body.template_name : null,
        templateLanguage:
          typeof body.template_language === 'string'
            ? body.template_language
            : null,
        templateParams: Array.isArray(body.template_params)
          ? body.template_params.filter(
              (value): value is string => typeof value === 'string'
            )
          : undefined,
        templateMessageParams: body.template_message_params,
        replyToMessageId:
          typeof body.reply_to_message_id === 'string'
            ? body.reply_to_message_id
            : null,
      }
    );
    return NextResponse.json({
      success: true,
      message_id: result.messageId,
      whatsapp_message_id: result.whatsappMessageId,
      status: 'sent',
    });
  } catch (error) {
    if (error instanceof MatrixSendError || error instanceof SendMessageError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.status }
      );
    }
    return toErrorResponse(error);
  }
}
