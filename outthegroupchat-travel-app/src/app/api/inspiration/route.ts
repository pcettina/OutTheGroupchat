import { handleInspirationGet, handleInspirationPost } from '@/lib/inspiration/handlers';

export async function GET(req: Request) {
  return handleInspirationGet(req);
}

export async function POST(req: Request) {
  return handleInspirationPost(req);
}
