const json = (status, body) => ({
  statusCode: status,
  headers: {
    'Content-Type': 'application/json',
    'Cache-Control': 'no-store',
  },
  body: JSON.stringify(body),
});

export default async (request) => {
  if (request.method !== 'POST') return json(405, { error: 'Method not allowed.' });

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return json(503, { error: 'NEXORA AI is not configured yet.' });

  const auth = request.headers.get('authorization') || '';
  const token = auth.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!token) return json(401, { error: 'Authentication required.' });

  // Validate the Supabase access token without exposing a service-role key.
  const supabaseUrl = process.env.SUPABASE_URL || 'https://fdupvvlircdnpimrqwgj.supabase.co';
  const supabaseKey = process.env.SUPABASE_PUBLISHABLE_KEY || '';
  if (!supabaseKey) return json(500, { error: 'Authentication service is not configured.' });

  const userResponse = await fetch(`${supabaseUrl}/auth/v1/user`, {
    headers: {
      apikey: supabaseKey,
      Authorization: `Bearer ${token}`,
    },
  });
  if (!userResponse.ok) return json(401, { error: 'Your session is invalid or expired.' });

  const user = await userResponse.json();
  if (!user?.id || !user?.email_confirmed_at) return json(403, { error: 'Please verify your email before using NEXORA.' });

  let input;
  try { input = JSON.parse(request.body || '{}'); }
  catch { return json(400, { error: 'Invalid request.' }); }

  const message = typeof input.message === 'string' ? input.message.trim() : '';
  const history = Array.isArray(input.history) ? input.history : [];
  if (!message) return json(400, { error: 'Message is required.' });
  if (message.length > 12000) return json(413, { error: 'Message is too long.' });

  const safeHistory = history.slice(-12).filter(item =>
    item && (item.role === 'user' || item.role === 'assistant') && typeof item.content === 'string'
  ).map(item => ({ role: item.role, content: item.content.slice(0, 12000) }));

  const model = process.env.OPENAI_MODEL || 'gpt-5.6-luna';
  const instructions = `You are NEXORA, a practical AI intelligence workspace. Be useful, direct, accurate, and transparent about uncertainty. Help the user research, analyze, create, plan, reason, and build. Do not claim to have browsed the web, opened files, or executed actions unless tools actually provided that capability. Prefer structured answers when they improve clarity.`;

  const response = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      instructions,
      input: [...safeHistory, { role: 'user', content: message }],
      max_output_tokens: 3000,
    }),
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    console.error('OpenAI request failed', response.status, data?.error?.type || data?.error?.message);
    return json(response.status === 429 ? 429 : 502, { error: 'NEXORA could not complete that request right now.' });
  }

  const output = data.output_text || (Array.isArray(data.output) ? data.output.flatMap(item => item.content || []).map(part => part.text).filter(Boolean).join('\n') : '');
  if (!output) return json(502, { error: 'NEXORA returned an empty response.' });

  return json(200, {
    output,
    model,
    requestId: data.id || null,
    userId: user.id,
  });
};
