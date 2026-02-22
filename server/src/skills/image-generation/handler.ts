/**
 * Image Generation Skill Handler
 * Uses 智谱 CogView API for image generation.
 * Requires ZHIPU_API_KEY environment variable.
 */
import type { SkillHandler } from '../registry.js';

const ZHIPU_BASE_URL = 'https://open.bigmodel.cn/api/paas/v4';

async function generateWithCogView(prompt: string, style?: string): Promise<string> {
  const apiKey = process.env.ZHIPU_API_KEY;
  if (!apiKey) {
    throw new Error('Image generation requires ZHIPU_API_KEY to be configured');
  }

  const fullPrompt = style ? `${prompt}, ${style} style` : prompt;

  const response = await fetch(`${ZHIPU_BASE_URL}/images/generations`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: 'cogview-3',
      prompt: fullPrompt,
    }),
    signal: AbortSignal.timeout(60000),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`CogView API error: ${response.status} ${text}`);
  }

  const data = await response.json() as {
    data: Array<{ url: string }>;
  };

  if (!data.data || data.data.length === 0) {
    throw new Error('No image generated');
  }

  return data.data[0].url;
}

const generateImage: SkillHandler = async (args) => {
  const prompt = args.prompt as string;
  const style = args.style as string | undefined;

  try {
    const imageUrl = await generateWithCogView(prompt, style);

    return JSON.stringify({
      prompt,
      style: style || 'default',
      imageUrl,
      message: 'Image generated successfully. The image URL is temporary and may expire.',
    });
  } catch (err) {
    return JSON.stringify({
      prompt,
      error: `Image generation failed: ${err instanceof Error ? err.message : String(err)}`,
    });
  }
};

export const handlers: Record<string, SkillHandler> = {
  generate_image: generateImage,
};
