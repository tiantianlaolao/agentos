/**
 * Image Generation Skill Manifest
 */
import type { SkillManifest } from '../../adapters/base.js';

export const manifest: SkillManifest = {
  name: 'image-generation',
  version: '1.0.0',
  description: 'Generate images from text descriptions using AI. Creates pictures, illustrations, and artwork based on natural language prompts.',
  author: 'AgentOS',
  agents: '*',
  environments: ['cloud'],
  permissions: ['network'],
  functions: [
    {
      name: 'generate_image',
      description: 'Generate an image from a text prompt. Returns a URL to the generated image.',
      parameters: {
        type: 'object',
        properties: {
          prompt: {
            type: 'string',
            description: 'Text description of the image to generate. Be specific about style, composition, and details.',
          },
          style: {
            type: 'string',
            description: 'Optional style hint: "realistic", "cartoon", "oil-painting", "watercolor", "3d-render", "pixel-art"',
          },
        },
        required: ['prompt'],
      },
    },
  ],
  audit: 'platform',
  auditSource: 'AgentOS',
  category: 'creative',
  emoji: '🎨',
  isDefault: false,
  locales: {
    zh: {
      displayName: 'AI 绘图',
      description: '根据文字描述使用 AI 生成图片，可创建插图、插画和艺术作品。',
      functions: {
        generate_image: '根据文字提示生成图片，返回生成图片的 URL。',
      },
    },
  },
};
