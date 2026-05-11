async function sha256(value) {
  if (!value) return undefined;
  const normalized = String(value).toLowerCase().trim();
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(normalized));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

async function sha256Phone(value) {
  if (!value) return undefined;
  const digits = String(value).replace(/\D/g, '').replace(/^0+/, '');
  const withCountry = digits.length <= 11 ? '55' + digits : digits;
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(withCountry));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

function parseCookies(header) {
  const out = {};
  for (const part of (header || '').split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k) out[k.trim()] = v.join('=');
  }
  return out;
}

export async function onRequestPost(context) {
  const { request, env } = context;

  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'invalid json' }, { status: 400 });
  }

  const {
    event_name,
    event_id,
    event_time,
    event_source_url,
    user_data = {},
  } = body;

  if (!event_name || !event_id) {
    return Response.json({ error: 'event_name and event_id are required' }, { status: 400 });
  }

  // Hash PII
  const hashed = {};
  if (user_data.em) hashed.em = await sha256(user_data.em);
  if (user_data.fn) hashed.fn = await sha256(user_data.fn);
  if (user_data.ln) hashed.ln = await sha256(user_data.ln);
  if (user_data.ph) hashed.ph = await sha256Phone(user_data.ph);

  // fbp / fbc from cookies
  const cookies = parseCookies(request.headers.get('cookie'));
  if (cookies._fbp) hashed.fbp = cookies._fbp;
  if (cookies._fbc) hashed.fbc = cookies._fbc;

  // Client signals
  const ip = request.headers.get('cf-connecting-ip') || request.headers.get('x-forwarded-for') || '';
  const ua = request.headers.get('user-agent') || '';
  if (ip) hashed.client_ip_address = ip;
  if (ua) hashed.client_user_agent = ua;

  const pixelId = env.META_PIXEL_ID;
  const token   = env.META_CAPI_TOKEN;

  if (!pixelId || !token) {
    return Response.json({ error: 'META_PIXEL_ID or META_CAPI_TOKEN not configured' }, { status: 500 });
  }

  const payload = {
    data: [{
      event_name,
      event_id,
      event_time: event_time || Math.floor(Date.now() / 1000),
      event_source_url: event_source_url || '',
      action_source: 'website',
      user_data: hashed,
    }],
  };

  const metaRes = await fetch(
    `https://graph.facebook.com/v19.0/${pixelId}/events?access_token=${token}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }
  );

  if (!metaRes.ok) {
    const err = await metaRes.text();
    return Response.json({ error: err }, { status: 502 });
  }

  return Response.json({ ok: true });
}
