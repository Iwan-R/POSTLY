// Vercel Serverless Function - Postly Generator
// Utilise OpenAI GPT-4 pour générer du contenu viral complet

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

    if (!niche || !platform || !duration || !userId) {
      return new Response(JSON.stringify({ error: 'Missing parameters' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const prompt = `Tu es Postly, l'IA de création de contenu viral #1 pour TikTok et Instagram. Tu dois générer un contenu COMPLET et ULTRA-OPTIMISÉ pour l'algorithme.

NICHE & SUJET : ${niche}
PLATEFORME : ${platform}
DURÉE : ${duration}

Génère EXACTEMENT dans cet ordre, avec ces balises EXACTES :

[CONCEPT]
L'idée principale et l'angle unique de la vidéo. Explique pourquoi cet angle va performer sur ${platform}. Sois précis sur la valeur apportée à l'audience. (3-4 phrases)
[/CONCEPT]

[HOOKS]
Génère 3 hooks différents ultra-percutants pour la PREMIÈRE SECONDE. Chaque hook doit être différent dans son approche (curiosité / choc / provocation). Pour chaque hook, explique en une phrase pourquoi il est efficace. Format :
Hook 1 : "..."
Pourquoi : ...
Hook 2 : "..."
Pourquoi : ...
Hook 3 : "..."
Pourquoi : ...
Recommandation : Hook X car ...
[/HOOKS]

[DESCRIPTION]
UNE SEULE phrase maximum pour la description sous la vidéo sur ${platform}. Elle doit être courte, percutante, avec 1 ou 2 emojis maximum, donner envie de regarder ou de commenter. Pas de hashtags ici, juste la phrase.
[/DESCRIPTION]

[SETUP]
Donne exactement ces informations sur chaque ligne avec le format "Titre: valeur" :
Position caméra: (hauteur, angle, distance exacte)
Lumière: (source, position, heure idéale si lumière naturelle)
Décor: (fond idéal, ce qu'on doit/ne doit pas voir)
Orientation: (vertical 9:16, etc.)
Tenue: (conseils vestimentaires pour cette niche)
Son: (micro intégré ou externe, conseils)
[/SETUP]

[POINTS]
Liste tous les points ESSENTIELS abordés dans la vidéo. Entre 5 et 10 points selon la durée. Format : une ligne par point, commence par "- ". Ce sont les grandes étapes du contenu que le créateur doit mémoriser AVANT de lire le script.
[/POINTS]

[SCRIPT]
Le script COMPLET et DÉTAILLÉ, mot pour mot, de A à Z. Adapté exactement à la durée ${duration}.
Format du script :
- [HOOK - 0:00] texte exact
- [PARTIE 1 - 0:05] texte exact avec indications de rythme en parenthèses (pause, accélère, insiste, regarde caméra, etc.)
- Continue ainsi pour TOUTE la vidéo
- [CTA FINAL - fin] texte exact du call-to-action

Le script doit être COMPLET, ne raccourcis pas. Pour un long format, écris vraiment tout.
[/SCRIPT]

[HASHTAGS]
Génère 20-25 hashtags viraux ultra-pertinents pour "${niche}" sur ${platform}. Mélange : 5 hashtags très populaires (>1M posts), 10 hashtags moyens (100K-1M), 5-10 hashtags de niche précis (<100K). Format : #hashtag séparés par des espaces.
[/HASHTAGS]

IMPORTANT : Sois COMPLET, PRÉCIS et ACTIONNABLE. Chaque conseil doit être applicable immédiatement.`;

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
            content: 'Tu es Postly, une IA experte en création de contenu viral pour TikTok et Instagram. Tu génères des contenus COMPLETS, PRÉCIS et ACTIONNABLES. Tu respectes TOUJOURS exactement le format demandé avec les balises. Tu ne raccourcis jamais les scripts.',
          },
          {
            role: 'user',
            content: prompt,
          },
        ],
        temperature: 0.85,
        max_tokens: 4000,
      }),
    });

    if (!openaiResponse.ok) {
      const errorData = await openaiResponse.text();
      console.error('OpenAI Error:', errorData);
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
    console.error('Function Error:', error);
    return new Response(JSON.stringify({
      error: 'Internal server error',
      message: error.message,
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
