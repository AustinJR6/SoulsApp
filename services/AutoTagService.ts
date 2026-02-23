/**
 * AutoTagService
 *
 * Sends a compressed photo (base64) to OpenAI GPT-4o-mini vision and returns
 * an array of descriptive tags. Returns [] gracefully on any failure.
 */

const OPENAI_KEY = process.env.EXPO_PUBLIC_OPENAI_API_KEY ?? '';

export async function autoTagPhoto(base64Jpeg: string): Promise<string[]> {
  if (!OPENAI_KEY) return [];

  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${OPENAI_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        max_tokens: 80,
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'image_url',
                image_url: {
                  url: `data:image/jpeg;base64,${base64Jpeg}`,
                  detail: 'low',
                },
              },
              {
                type: 'text',
                text: 'List 3–6 concise tags for this image (objects, mood, setting, people). Return ONLY a JSON array of lowercase strings, nothing else. Example: ["sunset","outdoors","peaceful"]',
              },
            ],
          },
        ],
      }),
    });

    if (!response.ok) return [];

    const data = await response.json() as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const content = data.choices?.[0]?.message?.content ?? '[]';
    const parsed = JSON.parse(content);
    return Array.isArray(parsed) ? (parsed as string[]).slice(0, 10) : [];
  } catch {
    return [];
  }
}
