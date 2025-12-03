import { gateway } from 'ai';
import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

export async function GET() {
  try {
    const availableModels = await gateway.getAvailableModels();
    
    // Transform the models to a simpler format for the frontend
    const models = availableModels.models.map((model) => ({
      id: model.id,
      name: model.name || model.id,
      description: model.description,
      provider: model.id.split('/')[0], // Extract provider from model ID
      pricing: model.pricing ? {
        input: model.pricing.input,
        output: model.pricing.output,
      } : undefined,
    }));

    return NextResponse.json({ models });
  } catch (error: any) {
    console.error('Error fetching gateway models:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to fetch models' },
      { status: 500 }
    );
  }
}

