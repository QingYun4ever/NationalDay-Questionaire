import { createWriteStream } from 'node:fs';
import { Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { NextResponse } from 'next/server';
import { maxMediaFileBytes, storePendingMedia } from '@/lib/server/storage';
import { MAX_IMAGE_BYTES } from '@/lib/submissions';

export const runtime = 'nodejs';

export async function GET() {
  return NextResponse.json({ maxFileMb: Math.floor(maxMediaFileBytes() / 1024 / 1024) }, { headers: { 'Cache-Control': 'no-store' } });
}

class UploadTooLargeError extends Error {}

export async function POST(request: Request) {
  const contentType = request.headers.get('content-type')?.split(';', 1)[0].trim().toLowerCase() ?? '';
  const rawName = request.headers.get('x-upload-name') ?? '';
  let fileName = '作品附件';
  try {
    fileName = decodeURIComponent(rawName);
  } catch {
    return NextResponse.json({ error: '文件名编码无效' }, { status: 400 });
  }
  if (!contentType.startsWith('image/') && !contentType.startsWith('video/')) {
    return NextResponse.json({ error: '只支持图片和视频文件' }, { status: 415 });
  }
  if (!request.body) return NextResponse.json({ error: '上传内容为空' }, { status: 400 });

  const maximum = contentType.startsWith('image/') ? MAX_IMAGE_BYTES : maxMediaFileBytes();
  const declaredLength = Number(request.headers.get('content-length') ?? 0);
  if (declaredLength > maximum) return NextResponse.json({ error: `单个文件不能超过 ${Math.floor(maximum / 1024 / 1024)} MB` }, { status: 413 });
  let received = 0;
  try {
    const metadata = await storePendingMedia(fileName, contentType, async (destination, maxBytes) => {
      const limiter = new Transform({
        transform(chunk: Buffer, _encoding, callback) {
          received += chunk.length;
          if (received > maxBytes) {
            callback(new UploadTooLargeError('文件超过服务器允许的大小'));
            return;
          }
          callback(null, chunk);
        },
      });
      await pipeline(
        Readable.fromWeb(request.body as Parameters<typeof Readable.fromWeb>[0]),
        limiter,
        createWriteStream(destination, { flags: 'wx', mode: 0o600 }),
      );
      return received;
    });
    return NextResponse.json(metadata, { status: 201 });
  } catch (error) {
    const tooLarge = error instanceof UploadTooLargeError;
    const message = tooLarge ? `单个文件不能超过 ${Math.floor(maximum / 1024 / 1024)} MB` : error instanceof Error ? error.message : '上传失败';
    return NextResponse.json({ error: message }, { status: tooLarge ? 413 : 400 });
  }
}
