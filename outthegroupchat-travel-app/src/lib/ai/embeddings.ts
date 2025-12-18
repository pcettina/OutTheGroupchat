import { openai, isOpenAIConfigured } from './client';
import { embed, embedMany } from 'ai';

// Helper to get OpenAI client or throw
function getOpenAIClient() {
  if (!isOpenAIConfigured() || !openai) {
    throw new Error('OpenAI is not configured. Please set OPENAI_API_KEY environment variable.');
  }
  return openai;
}

// Generate embedding for a single text
export async function generateEmbedding(text: string): Promise<number[]> {
  const client = getOpenAIClient();
  const { embedding } = await embed({
    model: client.embedding('text-embedding-3-small'),
    value: text,
  });
  return embedding;
}

// Generate embeddings for multiple texts
export async function generateEmbeddings(texts: string[]): Promise<number[][]> {
  const client = getOpenAIClient();
  const { embeddings } = await embedMany({
    model: client.embedding('text-embedding-3-small'),
    values: texts,
  });
  return embeddings;
}

// Calculate cosine similarity between two vectors
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) {
    throw new Error('Vectors must have the same length');
  }
  
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  
  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

// Semantic search interface
export interface SearchableItem {
  id: string;
  text: string;
  embedding?: number[];
  metadata?: Record<string, unknown>;
}

// In-memory vector store (for development/small datasets)
// For production, use Pinecone, Supabase pgvector, or similar
export class InMemoryVectorStore {
  private items: SearchableItem[] = [];

  async add(item: Omit<SearchableItem, 'embedding'>): Promise<void> {
    const embedding = await generateEmbedding(item.text);
    this.items.push({ ...item, embedding });
  }

  async addMany(items: Omit<SearchableItem, 'embedding'>[]): Promise<void> {
    const texts = items.map(item => item.text);
    const embeddings = await generateEmbeddings(texts);
    
    items.forEach((item, index) => {
      this.items.push({ ...item, embedding: embeddings[index] });
    });
  }

  async search(query: string, limit = 10): Promise<{ item: SearchableItem; score: number }[]> {
    const queryEmbedding = await generateEmbedding(query);
    
    const results = this.items
      .map(item => ({
        item,
        score: cosineSimilarity(queryEmbedding, item.embedding!),
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
    
    return results;
  }

  clear(): void {
    this.items = [];
  }

  get size(): number {
    return this.items.length;
  }
}

// Activity text builder for embedding
export function buildActivityText(activity: {
  name: string;
  description?: string | null;
  category?: string;
  location?: { address?: string; city?: string } | null;
  tags?: string[];
}): string {
  const parts = [
    activity.name,
    activity.description,
    activity.category,
    activity.location?.address,
    activity.location?.city,
    activity.tags?.join(' '),
  ].filter(Boolean);
  
  return parts.join(' ');
}

// Destination text builder for embedding
export function buildDestinationText(destination: {
  city: string;
  country: string;
  description?: string;
  attractions?: string[];
  vibes?: string[];
}): string {
  const parts = [
    destination.city,
    destination.country,
    destination.description,
    destination.attractions?.join(' '),
    destination.vibes?.join(' '),
  ].filter(Boolean);
  
  return parts.join(' ');
}

