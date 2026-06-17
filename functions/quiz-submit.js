export async function onRequestPost(context) {
  const { request, env } = context;

  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };

  try {
    const body = await request.json();
    const cookies = parseCookies(request.headers.get('Cookie') || '');
    const sessionId = cookies['_krob_sid'] || '';

    const path = body.path;
    if (!path || !['trafego', 'curso', 'conteudo'].includes(path)) {
      return new Response(JSON.stringify({ error: 'Invalid path' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const answers = body.answers || {};
    const answersJson = JSON.stringify(answers);
    const now = Math.floor(Date.now() / 1000);

    if (env.DB) {
      await env.DB.prepare(`
        INSERT INTO quiz_responses (session_id, path, answers, name, phone, created_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `).bind(
        sessionId, path, answersJson, body.name || null, body.phone || null, now
      ).run();
    }

    // Planilha de controle (Google Sheets via Apps Script Web App) — só
    // para o caminho de tráfego, o lead comercial qualificado com contato.
    if (path === 'trafego' && body.name && body.phone && env.SHEETS_WEBHOOK_URL) {
      context.waitUntil(
        fetch(env.SHEETS_WEBHOOK_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            timestamp: new Date().toISOString(),
            name: body.name,
            phone: body.phone,
            segmento: answers.segmento || '',
            investe_hoje: answers.investe_hoje || '',
            orcamento: answers.orcamento || '',
            urgencia: answers.urgencia || '',
          }),
        }).catch(() => {})
      );
    }

    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' },
    });
  }
}

export async function onRequestOptions() {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  });
}

function parseCookies(cookieHeader) {
  const cookies = {};
  cookieHeader.split(';').forEach(cookie => {
    const [name, ...rest] = cookie.trim().split('=');
    if (name) cookies[name.trim()] = rest.join('=');
  });
  return cookies;
}
