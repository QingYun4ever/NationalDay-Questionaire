import { NextResponse } from 'next/server';
import { removePendingMedia } from '@/lib/server/storage';

export const runtime = 'nodejs';

export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  await removePendingMedia(id);
  return new NextResponse(null, { status: 204 });
}
