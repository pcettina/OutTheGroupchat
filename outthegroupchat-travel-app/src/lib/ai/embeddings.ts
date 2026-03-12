/**
 * @module embeddings
 * Semantic embedding utilities using OpenAI's text-embedding-3-small model.
 * Provides vector generation, cosine similarity, in-memory vector store, and
 * text builders for activities and destinations.
 */
import { openai, isOpenAIConfigured } from './client';
import { embed, embedMany } from 'ai';

/** Returns the configured OpenAI client or throws if not configured. */
function getOpenAIClient() {
  if (!isOpenAIConfigured() || !openai) {
    throw new Error('OpenAI is not configured. Please set OPENAI_API_KEY environment variable.');
  }
  return openai;
}

/**
 * Generates a vector embedding for a single text string.
 * @param text - The text to embed.
 * @returns A float array representing the embedding vector.
 */
export async function generateEmbedding(text: string): Promise<number[]> {
  const client = getOpenAIClient();
  const { embedding } = await embed({
    model: client.embedding('text-embedding-3-small'),
    value: text,
  });
  return embedding;
}

/**
 * Generates vector embeddings for multiple text strings in a single API call.
 * @param texts - Array of strings to embed.
 * @returns Array of float arrays, one per input text.
 */
export async function generateEmbeddings(texts: string[]): Promise<number[][]> {
  const client = getOpenAIClient();
  const { embeddings } = await embedMany({
    model: client.embedding('text-embedding-3-small'),
    values: texts,
  });
  return embeddings;
}

/**
 * Computes cosine similarity between two equal-length vectors.
 * @param a - First vector.
 * @param b - Second vector (must be same length as a).
 * @returns Similarity score in range [-1, 1], where 1 is identical.
 * @throws If vectors have different lengths.
 */
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

/**
 * Builds a single concatenated text string from an activity object suitable for embedding.
 * Joins name, description, category, location, and tags with spaces.
 */
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

/**
 * Builds a single concatenated text string from a destination object suitable for embedding.
 * Joins city, country, description, attractions, and vibes with spaces.
 */
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

