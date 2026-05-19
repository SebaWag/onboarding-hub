import dotenv from 'dotenv';
dotenv.config();

const MIMO_BASE_URL = process.env.MIMO_BASE_URL || 'https://token-plan-cn.xiaomimimo.com/v1';
const MIMO_API_KEY = process.env.MIMO_API_KEY || '';
const MIMO_MODEL = process.env.MIMO_MODEL || 'mimo-v2-omni';

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string | Array<{ type: string; text?: string; image_url?: { url: string }; video_url?: { url: string } }>;
}

export interface MiMoResponse {
  id: string;
  choices: Array<{
    message: {
      role: string;
      content: string;
    };
    finish_reason: string;
  }>;
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

// Chat de texto simple
export async function chatCompletion(
  messages: ChatMessage[],
  options: { temperature?: number; max_tokens?: number; model?: string } = {}
): Promise<MiMoResponse> {
  const response = await fetch(`${MIMO_BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${MIMO_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: options.model || MIMO_MODEL,
      messages,
      temperature: options.temperature ?? 0.7,
      max_tokens: options.max_tokens ?? 4096,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`MiMo API error (${response.status}): ${error}`);
  }

  const data: MiMoResponse = await response.json() as MiMoResponse;
  return data;
}

// Análisis de video (el feature estrella para onboarding)
export async function analyzeVideo(
  videoUrl: string,
  prompt: string,
  systemPrompt?: string
): Promise<string> {
  const messages: ChatMessage[] = [];

  if (systemPrompt) {
    messages.push({ role: 'system', content: systemPrompt });
  }

  messages.push({
    role: 'user',
    content: [
      { type: 'video_url', video_url: { url: videoUrl } },
      { type: 'text', text: prompt },
    ],
  });

  const response = await chatCompletion(messages, { max_tokens: 8192 });
  return response.choices[0]?.message?.content || '';
}

// Análisis de imagen (screenshots, diagramas)
export async function analyzeImage(
  imageUrl: string,
  prompt: string
): Promise<string> {
  const messages: ChatMessage[] = [
    {
      role: 'user',
      content: [
        { type: 'image_url', image_url: { url: imageUrl } },
        { type: 'text', text: prompt },
      ],
    },
  ];

  const response = await chatCompletion(messages, { max_tokens: 4096 });
  return response.choices[0]?.message?.content || '';
}

// Chat con contexto RAG (knowledge base)
export async function chatWithContext(
  userMessage: string,
  context: string,
  conversationHistory: ChatMessage[] = []
): Promise<{ content: string; usage: MiMoResponse['usage'] }> {
  const systemPrompt = `Eres el asistente de onboarding de la empresa. Tu rol es ayudar a los nuevos colaboradores a integrarse rápidamente.

CONTEXTO DE LA BASE DE CONOCIMIENTO:
${context}

INSTRUCCIONES:
- Responde siempre en español, de forma clara y amigable
- Si la información está en el contexto, úsala para responder con precisión
- Si no tienes la información, dilo honestamente y sugiere a quién consultar
- Cuando references videos tutoriales, incluye el título y sugiere revisarlos
- Sé conciso pero completo`;

  const messages: ChatMessage[] = [
    { role: 'system', content: systemPrompt },
    ...conversationHistory,
    { role: 'user', content: userMessage },
  ];

  const response = await chatCompletion(messages, { temperature: 0.5, max_tokens: 4096 });

  return {
    content: response.choices[0]?.message?.content || '',
    usage: response.usage,
  };
}

export default {
  chatCompletion,
  analyzeVideo,
  analyzeImage,
  chatWithContext,
};
