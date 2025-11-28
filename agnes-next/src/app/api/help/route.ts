import { NextRequest, NextResponse } from 'next/server';
import nodemailer from 'nodemailer';

export async function POST(req: NextRequest) {
  try {
    const { email, topic, message, pageUrl } = await req.json();

    if (!email || !message) {
      return NextResponse.json(
        { error: 'Email and message are required.' },
        { status: 400 }
      );
    }

    console.log('[HELP] Incoming help request', {
      email,
      topic,
      message,
      pageUrl,
    });

    const host = process.env.HELP_SMTP_HOST;
    const user = process.env.HELP_SMTP_USER;
    const pass = process.env.HELP_SMTP_PASS;
    const port = Number(process.env.HELP_SMTP_PORT ?? 587);
    const to = process.env.HELP_INBOX ?? 'hello@theagnesprotocol.com';

    if (host && user && pass) {
      const transport = nodemailer.createTransport({
        host,
        port,
        secure: false,
        auth: { user, pass },
      });

      await transport.sendMail({
        from: `"Agnes Protocol Support" <${user}>`,
        to,
        subject: `Help request: ${topic || 'General'}`,
        text: [
          `From: ${email}`,
          `Topic: ${topic || 'General'}`,
          `Page: ${pageUrl || 'Unknown'}`,
          '',
          message,
        ].join('\n'),
      });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[HELP] Error handling help request', err);
    return NextResponse.json(
      { error: 'Unable to send help request right now.' },
      { status: 500 }
    );
  }
}

