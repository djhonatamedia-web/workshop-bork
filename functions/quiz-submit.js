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
    if (!path || !['trafego', 'curso', 'conteudo', 'diagnostico'].includes(path)) {
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

    // CRM (gestao) — cria automaticamente um card de Prospect quando o
    // binding CRM_DB estiver configurado. Não bloqueia nem quebra a
    // resposta do quiz se o binding ainda não existir ou a query falhar.
    if (path === 'trafego' && body.name && body.phone && env.CRM_DB) {
      context.waitUntil(
        (async () => {
          try {
            const col = await env.CRM_DB.prepare(
              `SELECT id FROM columns WHERE board = 'prospects' ORDER BY position ASC LIMIT 1`
            ).first();
            if (!col) return;
            const crmFields = JSON.stringify({
              phone: body.phone,
              segmento: answers.segmento || '',
              investe_hoje: answers.investe_hoje || '',
              orcamento: answers.orcamento || '',
              urgencia: answers.urgencia || '',
              source: 'quiz_trafego',
            });
            const maxPos = await env.CRM_DB.prepare(
              `SELECT COALESCE(MAX(position), -1) as maxp FROM cards WHERE column_id = ?`
            ).bind(col.id).first();
            await env.CRM_DB.prepare(`
              INSERT INTO cards (board, column_id, title, description, fields, position, created_at, updated_at)
              VALUES ('prospects', ?, ?, ?, ?, ?, ?, ?)
            `).bind(col.id, body.name, '', crmFields, maxPos.maxp + 1, now, now).run();
          } catch (e) {
            console.error('CRM_DB insert error:', e.message);
          }
        })()
      );
    }

    if (path === 'diagnostico' && body.name && body.phone && env.CRM_DB) {
      context.waitUntil(
        (async () => {
          try {
            const col = await env.CRM_DB.prepare(
              `SELECT id FROM columns WHERE board = 'prospects' ORDER BY position ASC LIMIT 1`
            ).first();
            if (!col) return;
            const crmFields = JSON.stringify({
              phone: body.phone,
              diagnosis: body.diagnosis || '',
              source: 'quiz_diagnostico',
            });
            const maxPos = await env.CRM_DB.prepare(
              `SELECT COALESCE(MAX(position), -1) as maxp FROM cards WHERE column_id = ?`
            ).bind(col.id).first();
            await env.CRM_DB.prepare(`
              INSERT INTO cards (board, column_id, title, description, fields, position, created_at, updated_at)
              VALUES ('prospects', ?, ?, ?, ?, ?, ?, ?)
            `).bind(col.id, body.name, '', crmFields, maxPos.maxp + 1, now, now).run();
          } catch (e) {
            console.error('CRM_DB insert error (diagnostico):', e.message);
          }
        })()
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
