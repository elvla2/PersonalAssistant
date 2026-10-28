import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { sendEmailReply } from '@/lib/smtp';
import { whatsAppManager } from '@/lib/whatsapp';

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await request.json();
    const {
      channel,
      recipient,
      subject,
      content,
      account_id,
      item_id,
      thread_id,
      in_reply_to,
      references,
    } = body;

    if (!channel || !content) {
      return NextResponse.json(
        { error: 'Channel and content are required.' },
        { status: 400 }
      );
    }

    // 1. Dispatch through corresponding channel
    if (channel === 'whatsapp') {
      let target = recipient;
      if (thread_id && (!target || (!target.includes('@') && !/^\+?\d{7,15}$/.test(target.trim())))) {
        const { data: thread } = await supabase
          .from('conversation_threads')
          .select('external_id')
          .eq('id', thread_id)
          .single();
        if (thread?.external_id) {
          target = thread.external_id;
        }
      }

      const userWhatsApp = whatsAppManager.getServiceForUser(user.id);
      const waRes = await userWhatsApp.sendMessage(target, content);
      if (!waRes.success) {
        return NextResponse.json(
          { error: waRes.error || 'Failed to send WhatsApp message.' },
          { status: 500 }
        );
      }
    } else if (channel === 'email') {
      if (!account_id) {
        return NextResponse.json(
          { error: 'account_id is required for sending emails.' },
          { status: 400 }
        );
      }

      // Fetch account details including decrypted password
      const { data: account, error: accError } = await supabase
        .from('accounts')
        .select('*')
        .eq('id', account_id)
        .eq('user_id', user.id)
        .single();

      if (accError || !account) {
        return NextResponse.json(
          { error: 'Account not found or access denied.' },
          { status: 404 }
        );
      }

      const smtpRes = await sendEmailReply({
        account,
        to: recipient,
        subject: subject || 'Reply',
        html: content,
        inReplyTo: in_reply_to,
        references,
      });

      if (!smtpRes.success) {
        return NextResponse.json(
          { error: smtpRes.error || 'SMTP dispatch failed.' },
          { status: 500 }
        );
      }
    } else {
      return NextResponse.json({ error: `Unsupported channel: ${channel}` }, { status: 400 });
    }

    // 2. Mark action item as completed
    if (item_id) {
      await supabase
        .from('action_items')
        .update({
          is_completed: true,
          resolved_at: new Date().toISOString(),
        })
        .eq('id', item_id)
        .eq('user_id', user.id);
    }

    // 3. Mark thread as resolved and update snippet/outgoing state
    if (thread_id) {
      const threadUpdate: any = {
        status: 'RESOLVED',
        is_outgoing_last: true,
        updated_at: new Date().toISOString(),
      };
      if (channel === 'whatsapp') {
        threadUpdate.snippet = content;
        threadUpdate.last_message_at = new Date().toISOString();
        threadUpdate.last_message_sender = 'Me';
      }

      await supabase
        .from('conversation_threads')
        .update(threadUpdate)
        .eq('id', thread_id)
        .eq('user_id', user.id);
    }

    return NextResponse.json({
      success: true,
      message: 'Reply sent successfully and action item completed!',
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
