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
      }),
    });

    if (!openaiResponse.ok) {
      const err = await openaiResponse.text();
      console.error('OpenAI error:', err);
      throw new Error('OpenAI API error');
    }

    const data = await openaiResponse.json();
    const fullText = data.choices[0].message.content;

    function extractSection(text, tag) {
      const regex = new RegExp(`\\[${tag}\\]([\\s\\S]*?)\\[\\/${tag}\\]`);
      const match = text.match(regex);
      return match ? match[1].trim() : '';
    }

    const result = {
      concept: extractSection(fullText, 'CONCEPT'),
      hooks: extractSection(fullText, 'HOOKS'),
      description: extractSection(fullText, 'DESCRIPTION'),
      setup: extractSection(fullText, 'SETUP'),
      points: extractSection(fullText, 'POINTS'),
      script: extractSection(fullText, 'SCRIPT'),
      hashtags: extractSection(fullText, 'HASHTAGS'),
    };

    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
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
