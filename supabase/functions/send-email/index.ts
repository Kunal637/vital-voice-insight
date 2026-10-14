import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { SmtpClient } from "https://deno.land/x/smtp@v0.7.0/mod.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  try {
    const { to, subject, html } = await req.json();
    if (!to || !subject || !html) return json({ error: 'Missing to, subject or html' }, 400);

    const GMAIL_SENDER = Deno.env.get('GMAIL_SENDER');
    const GMAIL_PASSWORD = Deno.env.get('GMAIL_PASSWORD');
    if (!GMAIL_SENDER || !GMAIL_PASSWORD) throw new Error('GMAIL_SENDER or GMAIL_PASSWORD not configured');

    const client = new SmtpClient();
    await client.connectTLS({
      hostname: 'smtp.gmail.com',
      port: 465,
      username: GMAIL_SENDER,
      password: GMAIL_PASSWORD,
    });

    await client.send({
      from: GMAIL_SENDER,
      to,
      subject,
      content: 'Please view this email in an HTML-capable client.',
      html,
    });

    await client.close();
    console.log(`Email sent to ${to}: ${subject}`);
    return json({ success: true });

  } catch (error) {
    console.error('Email send error:', error);
    return json({ error: error instanceof Error ? error.message : 'Failed to send email' }, 500);
  }
});
