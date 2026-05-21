export const config = {
  runtime: 'edge',
};

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://rgaftjkxcjxudobfiyyo.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;

async function supabaseFetch(path, options = {}) {
  return fetch(`${SUPABASE_URL}/rest/v1${path}`, {
    ...options,
    headers: {
      'apikey': SUPABASE_SERVICE_KEY,
      'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  });
}

export default async function handler(req) {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    const { niche, platform, duration, userId } = await req.json();

    if (!niche || !platform || !duration) {
      return new Response(JSON.stringify({ error: 'Missing parameters' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    if (!userId) {
      return new Response(JSON.stringify({ error: 'Authentication required' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // === VÉRIFICATION QUOTA ===
    const subRes = await supabaseFetch(
      `/subscriptions?user_id=eq.${userId}&select=id,plan,generations_used,generations_limit,reset_date,status`,
      { method: 'GET' }
    );

    if (!subRes.ok) {
      console.error('Supabase fetch error:', await subRes.text());
      return new Response(JSON.stringify({ error: 'Database error' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    let subs = await subRes.json();
    let sub = subs && subs.length > 0 ? subs[0] : null;

    // Si pas de ligne subscription, on la crée (free par défaut)
    if (!sub) {
      const newSubRes = await supabaseFetch('/subscriptions', {
        method: 'POST',
        headers: { 'Prefer': 'return=representation' },
        body: JSON.stringify({
          user_id: userId,
          plan: 'free',
          generations_used: 0,
          generations_limit: 10,
          reset_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
          status: 'active'
        })
      });
      const created = await newSubRes.json();
      sub = Array.isArray(created) ? created[0] : created;
    }

    // === AUTO-RESET si reset_date dépassée ===
    const now = new Date();
    const resetDate = sub.reset_date ? new Date(sub.reset_date) : null;

    if (resetDate && now > resetDate) {
      const newResetDate = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString();
      await supabaseFetch(`/subscriptions?id=eq.${sub.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          generations_used: 0,
          reset_date: newResetDate
        })
      });
      sub.generations_used = 0;
      sub.reset_date = newResetDate;
    }

    // === CHECK LIMITE ===
    const isUnlimited = sub.plan === 'pro' || sub.plan === 'premium';

    if (!isUnlimited && sub.generations_used >= sub.generations_limit) {
      return new Response(JSON.stringify({
        error: 'limit_reached',
        message: 'Tu as atteint ta limite de générations ce mois',
        plan: sub.plan,
        used: sub.generations_used,
        limit: sub.generations_limit,
        reset_date: sub.reset_date
      }), {
        status: 403,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // === GÉNÉRATION OPENAI ===
    const prompt = `Tu es Postly, l'IA de création de contenu viral #1 pour TikTok et Instagram.

NICHE & SUJET : ${niche}
PLATEFORME : ${platform}
DURÉE : ${duration}

RÈGLES ABSOLUES :
1. JAMAIS de généralités. TOUJOURS des noms précis (apps, marques, personnes, lieux)
2. TOUJOURS des chiffres concrets (€, %, durées, quantités)
3. Si tu parles d'une application → donne son vrai nom
4. Si tu parles d'une technique → donne les étapes exactes
5. Le créateur doit pouvoir filmer IMMÉDIATEMENT sans chercher quoi que ce soit

[CONCEPT]
L'idée précise et l'angle unique. Dis EXACTEMENT de quoi parle la vidéo, avec des éléments spécifiques. Pourquoi cet angle va performer sur ${platform}. (3-4 phrases ultra-concrètes)
[/CONCEPT]

[HOOKS]
3 hooks ultra-percutants pour la PREMIÈRE SECONDE. Chaque hook doit mentionner quelque chose de PRÉCIS. Format :
Hook 1 : "..."
Pourquoi : ...
Hook 2 : "..."
Pourquoi : ...
Hook 3 : "..."
Pourquoi : ...
Recommandation : Hook X car ...
[/HOOKS]

[DESCRIPTION]
UNE seule phrase percutante pour la description du post. Avec 1-2 emojis. Pas de hashtags. Concrète et spécifique.
[/DESCRIPTION]

[SETUP]
Position caméra: hauteur exacte, angle, distance
Lumière: source précise, position, heure recommandée
Décor: description précise du fond idéal
Orientation: vertical 9:16
Tenue: conseils vestimentaires adaptés à la niche
Son: type de micro recommandé, conseils précis
[/SETUP]

[POINTS]
5 à 10 points clés CONCRETS avec détails précis. Format : "- Point concret avec détail précis"
[/POINTS]

[SCRIPT]
Script COMPLET mot pour mot adapté à ${duration}. Chaque partie mentionne des éléments PRÉCIS. Jamais de "une application" — toujours le vrai nom.
- [HOOK - 0:00] texte exact
- [PARTIE 1 - 0:05] texte exact (indication rythme)
- Continue pour TOUTE la durée
- [CTA FINAL - fin] call-to-action précis
[/SCRIPT]

[HASHTAGS]
20-25 hashtags pour "${niche}" sur ${platform}. Mix populaires + moyens + niche. Format : #hashtag séparés par espaces.
[/HASHTAGS]`;

    const openaiResponse = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o',
        messages: [
          {
            role: 'system',
            content: 'Tu es Postly, une IA experte en création de contenu viral. JAMAIS de termes vagues. TOUJOURS des noms précis, des chiffres réels. Le script doit être complet et détaillé.',
          },
          { role: 'user', content: prompt },
        ],
        temperature: 0.8,
        max_tokens: 4000,
        stream: true,
      }),
    });

    if (!openaiResponse.ok) {
      const err = await openaiResponse.text();
      console.error('OpenAI error:', err);
      return new Response(JSON.stringify({ error: 'OpenAI API error', details: err }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // === INCRÉMENT QUOTA (pour les free seulement) ===
    if (!isUnlimited) {
      await supabaseFetch(`/subscriptions?id=eq.${sub.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          generations_used: (sub.generations_used || 0) + 1
        })
      });
    }

    // === STREAM OPENAI → CLIENT ===
    const stream = new ReadableStream({
      async start(controller) {
        const reader = openaiResponse.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop() || '';

            for (const line of lines) {
              if (line.startsWith('data: ')) {
                const data = line.slice(6).trim();
                if (data === '[DONE]') {
                  controller.close();
                  return;
                }
                try {
                  const json = JSON.parse(data);
                  const text = json.choices?.[0]?.delta?.content;
                  if (text) {
                    controller.enqueue(new TextEncoder().encode(text));
                  }
                } catch (e) {
                  // skip non-JSON lines
                }
              }
            }
          }
          controller.close();
        } catch (e) {
          controller.error(e);
        }
      },
    });

    return new Response(stream, {
      status: 200,
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    });

  } catch (error) {
    console.error('Error:', error);
    return new Response(JSON.stringify({
      error: 'Internal server error',
      message: error.message,
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
