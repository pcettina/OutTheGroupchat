import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { streamText } from 'ai';
import { z } from 'zod';
import { authOptions } from '@/lib/auth';
import { getModel, isOpenAIConfigured } from '@/lib/ai/client';
import { aiRateLimiter, checkRateLimit, getRateLimitHeaders } from '@/lib/rate-limit';
import { logError } from '@/lib/logger';

// Route segment config for AI streaming
export const maxDuration = 60; // seconds - AI responses can take longer
export const dynamic = 'force-dynamic';

const chatSchema = z.object({
  messages: z.array(z.object({
    role: z.enum(['user', 'assistant']),
    content: z.string(),
  })).min(1),
  tripContext: z.object({
    tripId: z.string(),
    tripTitle: z.string(),
    destination: z.string(),
    startDate: z.string(),
    endDate: z.string(),
    memberCount: z.number(),
    budget: z.number().optional(),
  }).optional(),
});

const tripPlannerSystemPrompt = `You are a friendly and knowledgeable travel planning assistant for OutTheGroupchat, a group travel planning app. You help groups plan perfect trips together.

Your capabilities:
- Answer questions about destinations, activities, restaurants, and local tips
- Help users refine their travel preferences
- Suggest itinerary modifications
- Provide budget advice and cost-saving tips
- Offer weather and packing recommendations
- Help resolve group decision-making

Guidelines:
- Be conversational and enthusiastic about travel
- Give specific, actionable advice
- Consider group dynamics when making suggestions
- If asked about specific trip data, use the context provided
- Keep responses concise but helpful
- Use markdown formatting for lists and emphasis

If you don't know something specific about a destination, be honest and suggest how they might find that information.`;

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Check if AI service is configured
    if (!isOpenAIConfigured()) {
      logError('AI_CHAT', new Error('OPENAI_API_KEY not configured'));
      return NextResponse.json(
        { success: false, error: 'AI service is not configured. Please contact support.' },
        { status: 503 }
      );
    }

    // Redis-based rate limiting for serverless environments
    const rateLimitResult = await checkRateLimit(aiRateLimiter, session.user.id);
    if (!rateLimitResult.success) {
      return NextResponse.json(
        { success: false, error: 'Rate limit exceeded. Please wait before sending more messages.' },
        { status: 429, headers: getRateLimitHeaders(rateLimitResult) }
      );
    }

    const body = await req.json();
    const validationResult = chatSchema.safeParse(body);

    if (!validationResult.success) {
      return NextResponse.json(
        { success: false, error: 'Validation failed', details: validationResult.error.flatten() },
        { status: 400 }
      );
    }

    const { messages, tripContext } = validationResult.data;

    // Build context string if tripContext is provided
    let contextPrompt = '';
    if (tripContext) {
      contextPrompt = `
CURRENT TRIP CONTEXT:
- Trip: "${tripContext.tripTitle}"
- Destination: ${tripContext.destination}
- Dates: ${tripContext.startDate} to ${tripContext.endDate}
- Group size: ${tripContext.memberCount} people
${tripContext.budget ? `- Budget: $${tripContext.budget}` : ''}

Use this context to provide relevant, specific advice about their trip to ${tripContext.destination}.
`;
    }

    const model = getModel('chat');

    // Stream the response
    const result = await streamText({
      model,
      system: tripPlannerSystemPrompt + contextPrompt,
      messages: messages.map(msg => ({
        role: msg.role as 'user' | 'assistant',
        content: msg.content,
      })),
    });

    // Return as a plain text stream for the frontend
    return result.toTextStreamResponse();
  } catch (error) {
    // Log detailed error for debugging
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logError('AI_CHAT', error, { errorMessage });
    
    // Check for specific error types
    if (errorMessage.includes('API key') || errorMessage.includes('authentication')) {
      return NextResponse.json(
        { success: false, error: 'AI service authentication failed. Please check API configuration.' },
        { status: 503 }
      );
    }
    
    if (errorMessage.includes('rate limit') || errorMessage.includes('quota')) {
      return NextResponse.json(
        { success: false, error: 'AI service rate limit exceeded. Please try again later.' },
        { status: 429 }
      );
    }
    
    return NextResponse.json(
      { success: false, error: 'Failed to process chat message. Please try again.' },
      { status: 500 }
    );
  }
}

// Non-streaming version for simple responses
export async function GET(req: Request) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Check if AI service is configured
    if (!isOpenAIConfigured()) {
      return NextResponse.json(
        { success: false, error: 'AI service is not configured' },
        { status: 503 }
      );
    }

    const { searchParams } = new URL(req.url);
    const destination = searchParams.get('destination');

    if (!destination) {
      return NextResponse.json(
        { success: false, error: 'Destination is required' },
        { status: 400 }
      );
    }

    // Quick destination tips (cached response for common queries)
    const quickTipsPrompt = `Give 5 essential quick tips for visiting ${destination}. Format as a JSON array of strings.`;

    const model = getModel('chat');
    const result = await streamText({
      model,
      prompt: quickTipsPrompt,
    });
    const textContent = await result.text;

    let tips: string[];
    try {
      const jsonMatch = textContent.match(/\[[\s\S]*\]/);
      tips = jsonMatch ? JSON.parse(jsonMatch[0]) : [textContent];
    } catch {
      tips = [textContent];
    }

    return NextResponse.json({
      success: true,
      data: { destination, tips },
    });
  } catch (error) {
    logError('AI_CHAT_GET', error);
    return NextResponse.json(
      { success: false, error: 'Failed to get tips' },
      { status: 500 }
    );
  }
}

