export const config = {
  runtime: 'edge',
};

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

    // Appel OpenAI EN STREAMING
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

    // On renvoie le stream directement au client
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
