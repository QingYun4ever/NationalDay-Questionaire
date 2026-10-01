import { NextResponse } from 'next/server';
import { hasAdminSession } from '@/lib/server/admin-auth';
import { deleteAllSubmissions, listSubmissions } from '@/lib/server/storage';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  if (!hasAdminSession(request)) return NextResponse.json({ error: '请先登录管理后台' }, { status: 401 });
  try {
    return NextResponse.json({ submissions: await listSubmissions() }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch {
    return NextResponse.json({ error: '读取投稿数据失败，请检查数据卷权限和磁盘状态' }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  if (!hasAdminSession(request)) return NextResponse.json({ error: '请先登录管理后台' }, { status: 401 });
  try {
    const count = await deleteAllSubmissions();
    return NextResponse.json({ deleted: count });
  } catch {
    return NextResponse.json({ error: '清空投稿失败，请检查数据卷权限和磁盘状态' }, { status: 500 });
  }
}
