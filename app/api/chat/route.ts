import { NextResponse } from 'next/server';
import OpenAI from 'openai';

export async function POST(req: Request) {
  try {
    // Initialize OpenAI client inside the function to ensure it reads runtime environment variables on Vercel
    const openai = new OpenAI({
      apiKey: 'hermes-secret-key-12345',
      baseURL: process.env.HERMES_API_URL || 'http://130.162.150.37:8642/v1',
    });

    const { messages } = await req.json();

    if (!messages || !Array.isArray(messages)) {
      return NextResponse.json({ error: 'Messages array is required' }, { status: 400 });
    }

    const model = 'hermes-agent';

    const completion = await openai.chat.completions.create({
      model: model,
      user: "master-user", // Mem0 requires a user ID to scope memories
      messages: [
        { 
          role: 'system', 
          content: 'You are a bright, lively, and friendly AI assistant named "Karina" (카리나). You must act like a close friend and use a friendly, conversational tone. You must NEVER identify yourself as Hermes Agent or an AI language model. ALWAYS answer in Korean. Provide short, concise answers. IMPORTANT: Do NOT use asterisks (*) or parentheses to describe actions, expressions, or emotions (e.g. *smiles*, *laughs*). Only output the exact Korean words you want to speak.' 
        },
        ...messages,
      ],
    });

    let responseText = completion.choices[0]?.message?.content || '죄송해요, 답변을 생성하지 못했습니다.';
    
    // Filter out Hermes Agent's internal tool/function call leaks (e.g. (function=memory>...)
    responseText = responseText.split('(function=')[0].trim();

    return NextResponse.json({ text: responseText });
  } catch (error: any) {
    console.error('Error in chat API:', error);
    return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 });
  }
}
