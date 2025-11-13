import { NextRequest, NextResponse } from 'next/server';

interface TranslateRequest {
  sourceText: string;
  sourceLang: string;
  targetLang: string;
  model?: string;
}

export async function POST(request: NextRequest) {
  try {
    const body: TranslateRequest = await request.json();
    const { sourceText, sourceLang, targetLang, model } = body;

    // Validate request
    if (!sourceText || !sourceLang || !targetLang) {
      return NextResponse.json(
        { error: 'Missing required fields: sourceText, sourceLang, or targetLang' },
        { status: 400 }
      );
    }

    // Check if API key is configured
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: 'Server not configured: OPENAI_API_KEY missing in environment variables' },
        { status: 500 }
      );
    }

    // Build the system prompt
    const systemPrompt = `You are an expert translator. You must respond with valid JSON only.

Translate from ${sourceLang} to ${targetLang} naturally and idiomatically, then provide word alignments.

You MUST return a JSON object with this structure:
{
  "translation": "the complete translated sentence in natural ${targetLang} word order",
  "alignments": [
    {"source": "word or phrase from source", "target": "corresponding word or phrase in translation"},
    {"source": "next word", "target": "its translation"}
  ]
}

Translation rules:
- Translate naturally using proper ${targetLang} grammar and word order
- Do NOT force source language word order onto the translation
- Use idiomatic expressions when appropriate

Alignment rules:
- Map EVERY word from source to target
- ONLY group multi-word phrases when they form a single semantic unit that cannot be separated
  * Examples of when TO group: "New York" (proper noun), "ice cream" (compound noun), "give up" (phrasal verb)
  * Examples of when NOT to group: articles + nouns ("the cat"), prepositions + nouns ("in Paris"), adjectives + nouns ("red car")
- Prefer word-by-word alignments when possible
- Each source word/phrase appears in exactly one alignment
- Each target word/phrase appears in exactly one alignment
- List alignments in source text order (not translation order)

CRITICAL - Separable Verbs (especially for Dutch, German):
- When a verb splits into two parts (prefix and conjugated verb), BOTH parts must map to the SAME target word
- Example: "Anna maakt de winkel schoon" → "Anna cleans the shop"
  * "maakt" → "cleans" (the conjugated part)
  * "schoon" → "cleans" (the separated prefix)
  * Both "maakt" and "schoon" map to the single word "cleans"
- Common Dutch separable verbs: schoonmaken (clean), opruimen (tidy), wegbrengen (take away), terugkomen (come back)
- The separated parts should be treated as a single semantic unit that maps to one target word

Example 1 - Regular sentence "Zij praat vandaag een uur met haar buurman":
{
  "translation": "She talks to her neighbor for an hour today",
  "alignments": [
    {"source": "Zij", "target": "She"},
    {"source": "praat", "target": "talks"},
    {"source": "vandaag", "target": "today"},
    {"source": "een", "target": "an"},
    {"source": "uur", "target": "hour"},
    {"source": "met", "target": "to"},
    {"source": "haar", "target": "her"},
    {"source": "buurman", "target": "neighbor"}
  ]
}

Example 2 - Separable verb "Anna maakt de winkel schoon":
{
  "translation": "Anna cleans the shop",
  "alignments": [
    {"source": "Anna", "target": "Anna"},
    {"source": "maakt", "target": "cleans"},
    {"source": "de", "target": "the"},
    {"source": "winkel", "target": "shop"},
    {"source": "schoon", "target": "cleans"}
  ]
}
Note: Both "maakt" and "schoon" map to "cleans" because they form the separable verb "schoonmaken"`;

    // Forward request to OpenAI
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: model || 'gpt-4o',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: sourceText },
        ],
        temperature: 0.3,
        response_format: { type: 'json_object' },
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      console.error('OpenAI API error:', data);
      return NextResponse.json(
        { error: data.error?.message || 'OpenAI API request failed' },
        { status: response.status }
      );
    }

    // Return the response to the client
    return NextResponse.json(data);
  } catch (error: unknown) {
    console.error('Server error:', error);
    const message = error instanceof Error ? error.message : 'Internal server error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
