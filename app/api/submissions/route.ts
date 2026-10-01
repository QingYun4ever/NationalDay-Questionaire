import { randomUUID } from 'node:crypto';
import { NextResponse } from 'next/server';
import { FORMATS_BY_ACTIVITY, MAX_PHOTO_IMAGES, MAX_COLLECTION_IMAGES, type Activity } from '@/lib/submissions';
import { cleanExpiredPendingMedia, createSubmission } from '@/lib/server/storage';

export const runtime = 'nodejs';

function field(value: unknown, maximum: number) {
  return typeof value === 'string' ? value.trim().slice(0, maximum) : '';
}

export async function POST(request: Request) {
  let body: Record<string, unknown>;
  try {
    body = await request.json() as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: '投稿内容格式无效' }, { status: 400 });
  }
  const activity = body.activity;
  if (activity !== 'holiday' && activity !== 'poem') return NextResponse.json({ error: '请选择有效的投稿活动' }, { status: 400 });
  const selectedActivity: Activity = activity;
  const format = field(body.format, 40);
  if (!FORMATS_BY_ACTIVITY[selectedActivity].includes(format)) return NextResponse.json({ error: '请选择有效的作品形式' }, { status: 400 });

  const name = field(body.name, 20);
  const className = field(body.className, 40);
  const contact = field(body.contact, 40);
  const title = field(body.title, 60);
  const copy = typeof body.copy === 'string' ? body.copy.trim() : '';
  const otherFormat = field(body.otherFormat, 30);
  const attachmentIds = Array.isArray(body.attachmentIds) && body.attachmentIds.every((id) => typeof id === 'string') ? body.attachmentIds as string[] : null;
  if (!name || !className || !contact || !title || !attachmentIds) return NextResponse.json({ error: '姓名、班级、微信号和作品标题为必填项' }, { status: 400 });
  if (activity === 'poem' && !copy) return NextResponse.json({ error: '请填写诗歌正文' }, { status: 400 });
  if (format === '其他' && !otherFormat) return NextResponse.json({ error: '请填写其他作品形式' }, { status: 400 });
  const maximumAttachments = format === '摄影组图' ? MAX_COLLECTION_IMAGES : MAX_PHOTO_IMAGES;
  if (attachmentIds.length > maximumAttachments || attachmentIds.some((id) => id.length > 64)) return NextResponse.json({ error: `当前作品形式最多 ${maximumAttachments} 个附件，且附件编号必须有效` }, { status: 400 });

  try {
    await cleanExpiredPendingMedia();
    const record = await createSubmission({
      id: randomUUID(),
      activity: selectedActivity,
      name,
      className,
      contact,
      format,
      otherFormat,
      title,
      copy,
      attachmentIds,
    });
    return NextResponse.json({ id: record.id, createdAt: record.createdAt }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : '保存投稿失败' }, { status: 400 });
  }
}
