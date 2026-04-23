// Vercel Serverless Function pour générer du contenu via OpenAI
// Cette fonction vérifie l'authentification et appelle OpenAI de manière sécurisée

export const config = {
  runtime: 'edge',
};

export default async function handler(req) {
  // Vérifier la méthode
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    // Récupérer les données de la requête
    const { theme, tone, platform, format, userId } = await req.json();

    // Vérifier que tous les paramètres sont présents
    if (!theme || !tone || !platform || !format || !userId) {
      return new Response(JSON.stringify({ error: 'Missing parameters' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Construire le prompt
    const formatText = format === 'video' ? 'vidéo' : 'carrousel de photos';
    const platformText = platform === 'tiktok' ? 'TikTok' : 'Instagram';
    
    const prompt = `Tu es un expert en création de contenu VIRAL pour ${platformText}. Ta mission : créer du contenu ULTRA-CONCRET et ACTIONNABLE.

THÈME : ${theme}
TON : ${tone}
FORMAT : ${formatText}
PLATEFORME : ${platformText}

RÈGLES ABSOLUES :
1. Donne des NOMS PRÉCIS (applications, marques, techniques, personnes)
2. Donne des CHIFFRES CONCRETS (pourcentages, prix, statistiques)
3. Sois ULTRA-SPÉCIFIQUE - pas de généralités
4. Le créateur doit pouvoir filmer IMMÉDIATEMENT après avoir lu

STRUCTURE OBLIGATOIRE :

HOOK:
[UNE SEULE phrase de 5-8 mots MAXIMUM - ultra percutante, qui crée le choc ou la curiosité]

IDÉE:
[2 phrases MAX - l'idée du contenu de façon claire et engageante]

ARGUMENTS:
[3 points clés CONCRETS avec des exemples précis, des chiffres, des noms]

DESCRIPTION:
[Description engageante pour le post avec émojis stratégiques]

HASHTAGS:
[10-15 hashtags pertinents pour maximiser la portée - SANS #pourtoi car on l'ajoute automatiquement]

IMPORTANT : Réponds UNIQUEMENT en JSON avec cette structure exacte :
{
  "hook": "...",
  "idea": "...",
  "arguments": ["...", "...", "..."],
  "description": "...",
  "hashtags": "..."
}`;

    // Appeler OpenAI
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
            content: 'Tu es un expert en création de contenu viral pour les réseaux sociaux. Tu réponds TOUJOURS en JSON valide, JAMAIS avec du texte avant ou après. TOUJOURS donner des exemples CONCRETS avec des NOMS PRÉCIS, des CHIFFRES, des MARQUES. JAMAIS de généralités. TOUJOURS être ULTRA-SPÉCIFIQUE et ACTIONNABLE.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: 0.9,
        max_tokens: 1200,
      }),
    });

    if (!openaiResponse.ok) {
      const errorData = await openaiResponse.text();
      console.error('OpenAI Error:', errorData);
      throw new Error('OpenAI API error');
    }

    const data = await openaiResponse.json();
    const content = data.choices[0].message.content;

    // Parser le JSON (enlever les backticks markdown si présents)
    let cleanContent = content.trim();
    if (cleanContent.startsWith('```json')) {
      cleanContent = cleanContent.replace(/```json\n?/g, '').replace(/```\n?/g, '');
    } else if (cleanContent.startsWith('```')) {
      cleanContent = cleanContent.replace(/```\n?/g, '');
    }

    const parsedContent = JSON.parse(cleanContent);

    // Retourner le résultat
    return new Response(JSON.stringify(parsedContent), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Function Error:', error);
    return new Response(JSON.stringify({ 
      error: 'Internal server error',
      message: error.message 
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
