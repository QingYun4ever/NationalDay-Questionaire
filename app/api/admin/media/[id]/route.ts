import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { Readable } from 'node:stream';
import { NextResponse } from 'next/server';
import { hasAdminSession } from '@/lib/server/admin-auth';
import { listSubmissions, mediaFilePath } from '@/lib/server/storage';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  if (!hasAdminSession(request)) return NextResponse.json({ error: '请先登录管理后台' }, { status: 401 });
  const { id } = await context.params;
  try {
    const records = await listSubmissions();
    const attachment = records.flatMap((record) => record.attachments).find((item) => item.id === id);
    if (!attachment) return NextResponse.json({ error: '附件不存在' }, { status: 404 });

    const filePath = mediaFilePath(id);
    const fileInfo = await stat(filePath);
    const headers = new Headers({
      'Accept-Ranges': 'bytes',
      'Cache-Control': 'private, no-store',
      'Content-Type': attachment.type || 'application/octet-stream',
      'X-Content-Type-Options': 'nosniff',
    });
    const asciiName = attachment.name.replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '_');
    const encodedName = encodeURIComponent(attachment.name).replace(/[']/g, '%27');
    const disposition = new URL(request.url).searchParams.get('download') === '1' ? 'attachment' : 'inline';
    headers.set('Content-Disposition', `${disposition}; filename="${asciiName}"; filename*=UTF-8''${encodedName}`);

    let start = 0;
    let end = fileInfo.size - 1;
    let status = 200;
    const range = request.headers.get('range');
    if (range) {
      const match = /^bytes=(\d*)-(\d*)$/.exec(range.trim());
      if (!match || fileInfo.size === 0) {
        headers.set('Content-Range', `bytes */${fileInfo.size}`);
        return new Response(null, { status: 416, headers });
      }
      if (!match[1]) {
        const suffixLength = Number(match[2]);
        if (!suffixLength) {
          headers.set('Content-Range', `bytes */${fileInfo.size}`);
          return new Response(null, { status: 416, headers });
        }
        start = Math.max(0, fileInfo.size - suffixLength);
      } else {
        start = Number(match[1]);
        end = match[2] ? Math.min(Number(match[2]), fileInfo.size - 1) : fileInfo.size - 1;
      }
      if (start > end || start >= fileInfo.size) {
        headers.set('Content-Range', `bytes */${fileInfo.size}`);
        return new Response(null, { status: 416, headers });
      }
      status = 206;
      headers.set('Content-Range', `bytes ${start}-${end}/${fileInfo.size}`);
    }

    headers.set('Content-Length', String(end - start + 1));
    const stream = createReadStream(filePath, { start, end });
    return new Response(Readable.toWeb(stream) as ReadableStream<Uint8Array>, { status, headers });
  } catch {
    return NextResponse.json({ error: '读取附件失败' }, { status: 404 });
  }
}
