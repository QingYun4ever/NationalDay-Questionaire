import { NextResponse } from 'next/server';
import { hasAdminSession } from '@/lib/server/admin-auth';
import { deleteSubmission } from '@/lib/server/storage';

export const runtime = 'nodejs';

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  if (!hasAdminSession(request)) return NextResponse.json({ error: '请先登录管理后台' }, { status: 401 });
  const { id } = await context.params;
  try {
    const deleted = await deleteSubmission(id);
    if (!deleted) return NextResponse.json({ error: '投稿不存在或已删除' }, { status: 404 });
    return NextResponse.json({ deleted: true });
  } catch {
    return NextResponse.json({ error: '删除投稿失败，请稍后重试' }, { status: 500 });
  }
}
