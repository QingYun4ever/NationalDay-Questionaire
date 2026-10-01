import 'server-only';
import { randomUUID } from 'node:crypto';
import { chmod, mkdir, readFile, readdir, rename, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { AttachmentKind, AttachmentMeta, Submission } from '@/lib/submissions';
import { MAX_IMAGE_BYTES, MAX_PHOTO_IMAGES, MAX_COLLECTION_IMAGES } from '@/lib/submissions';

interface PendingMedia extends AttachmentMeta {}
type StorageGlobal = typeof globalThis & { gqjStorageQueue?: Promise<void> };
const storageGlobal = globalThis as StorageGlobal;
const idPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function storageRoot() {
  return path.resolve(process.env.DATA_DIR || path.join(process.cwd(), 'data'));
}

function pendingDirectory() {
  return path.join(storageRoot(), 'uploads');
}

function mediaDirectory() {
  return path.join(storageRoot(), 'media');
}

function recordsPath() {
  return path.join(storageRoot(), 'submissions.json');
}

export function maxMediaFileBytes() {
  const megabytes = Number(process.env.MAX_MEDIA_FILE_MB || 250);
  return (Number.isSafeInteger(megabytes) && megabytes > 0 ? megabytes : 250) * 1024 * 1024;
}

export function validMediaId(id: string) {
  return idPattern.test(id);
}

export function mediaFilePath(id: string) {
  if (!validMediaId(id)) throw new Error('无效的附件编号');
  return path.join(mediaDirectory(), id);
}

async function ensureDirectories() {
  const directories = [storageRoot(), pendingDirectory(), mediaDirectory()];
  await Promise.all(directories.map(async (directory) => {
    await mkdir(directory, { recursive: true, mode: 0o700 });
    await chmod(directory, 0o700);
  }));
}

async function readRecords(): Promise<Submission[]> {
  await mkdir(storageRoot(), { recursive: true });
  try {
    const parsed: unknown = JSON.parse(await readFile(recordsPath(), 'utf8'));
    if (!Array.isArray(parsed)) throw new Error('投稿记录文件格式错误');
    return parsed as Submission[];
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return [];
    throw error;
  }
}

async function writeRecords(records: Submission[]) {
  await mkdir(storageRoot(), { recursive: true });
  const temporary = path.join(storageRoot(), `.submissions-${randomUUID()}.tmp`);
  try {
    await writeFile(temporary, JSON.stringify(records, null, 2), { encoding: 'utf8', flag: 'wx', mode: 0o600 });
    await rename(temporary, recordsPath());
  } catch (error) {
    await rm(temporary, { force: true }).catch(() => undefined);
    throw error;
  }
}

function withStorageLock<T>(operation: () => Promise<T>): Promise<T> {
  storageGlobal.gqjStorageQueue ??= Promise.resolve();
  const result = storageGlobal.gqjStorageQueue.then(operation, operation);
  storageGlobal.gqjStorageQueue = result.then(() => undefined, () => undefined);
  return result;
}

function metadataPath(id: string) {
  if (!validMediaId(id)) throw new Error('无效的附件编号');
  return path.join(pendingDirectory(), `${id}.json`);
}

export async function storePendingMedia(fileName: string, contentType: string, writeStream: (destination: string, maxBytes: number) => Promise<number>) {
  if (!contentType.startsWith('image/') && !contentType.startsWith('video/')) throw new Error('只支持图片和视频文件');
  const id = randomUUID();
  await ensureDirectories();
  const destination = path.join(pendingDirectory(), id);
  try {
    const size = await writeStream(destination, contentType.startsWith('image/') ? MAX_IMAGE_BYTES : maxMediaFileBytes());
    if (size <= 0) throw new Error('不能上传空文件');
    const kind: AttachmentKind = contentType.startsWith('video/') ? 'video' : 'image';
    const safeName = fileName.replace(/[\\/\x00-\x1f\x7f]/g, '_').slice(0, 255) || '作品附件';
    const metadata: PendingMedia = { id, name: safeName, type: contentType, size, kind };
    await writeFile(metadataPath(id), JSON.stringify(metadata), { encoding: 'utf8', flag: 'wx', mode: 0o600 });
    return metadata;
  } catch (error) {
    await rm(destination, { force: true }).catch(() => undefined);
    await rm(metadataPath(id), { force: true }).catch(() => undefined);
    throw error;
  }
}

export async function removePendingMedia(id: string) {
  if (!validMediaId(id)) return;
  await Promise.all([
    rm(path.join(pendingDirectory(), id), { force: true }),
    rm(path.join(pendingDirectory(), `${id}.json`), { force: true }),
  ]);
}

export async function cleanExpiredPendingMedia() {
  await ensureDirectories();
  const entries = await readdir(pendingDirectory());
  const cutoff = Date.now() - 24 * 60 * 60 * 1000;
  await Promise.all(entries.map(async (entry) => {
    const entryPath = path.join(pendingDirectory(), entry);
    const info = await stat(entryPath).catch(() => null);
    if (info && info.mtimeMs < cutoff) await rm(entryPath, { force: true });
  }));
}

export async function listSubmissions() {
  return readRecords();
}

export async function createSubmission(input: Omit<Submission, 'createdAt' | 'attachments'> & { attachmentIds: string[] }) {
  return withStorageLock(async () => {
    await ensureDirectories();
    const records = await readRecords();
    if (records.some((record) => record.id === input.id)) throw new Error('投稿编号已存在，请重新提交');
    const attachmentIds = [...new Set(input.attachmentIds)];
    if (attachmentIds.length !== input.attachmentIds.length) throw new Error('附件重复');

    const attachments: PendingMedia[] = [];
    for (const id of attachmentIds) {
      const metadata = JSON.parse(await readFile(metadataPath(id), 'utf8')) as PendingMedia;
      const current = await stat(path.join(pendingDirectory(), id));
      if (current.size !== metadata.size) throw new Error(`附件「${metadata.name}」上传不完整，请重新选择`);
      attachments.push(metadata);
    }
    const maximumAttachments = input.format === '摄影组图' ? MAX_COLLECTION_IMAGES : MAX_PHOTO_IMAGES;
    if (attachments.length > maximumAttachments) throw new Error(`当前作品形式最多提交 ${maximumAttachments} 个附件`);
    if (attachments.some((attachment) => attachment.kind === 'image' && attachment.size > MAX_IMAGE_BYTES)) throw new Error('单张图片不能超过 50 MB');
    if (input.format === '短视频') {
      if (attachments.length !== 1 || attachments[0].kind !== 'video') throw new Error('短视频作品需要上传 1 个视频文件');
    } else if (attachments.some((attachment) => attachment.kind !== 'image')) {
      throw new Error('当前作品形式只接受图片附件');
    }
    if (input.activity === 'holiday' && attachments.length === 0) {
      throw new Error('活动一必须上传作品附件');
    }
    if (input.activity === 'poem' && input.format === '手写诗稿 / 插图' && attachments.length === 0) {
      throw new Error('手写诗稿 / 插图形式至少需要上传 1 张图片');
    }

    const moved: PendingMedia[] = [];
    try {
      for (const attachment of attachments) {
        await rename(path.join(pendingDirectory(), attachment.id), mediaFilePath(attachment.id));
        moved.push(attachment);
      }
      const record: Submission = {
        id: input.id,
        createdAt: new Date().toISOString(),
        activity: input.activity,
        name: input.name,
        className: input.className,
        contact: input.contact,
        format: input.format,
        otherFormat: input.otherFormat,
        title: input.title,
        copy: input.copy,
        attachments,
      };
      await writeRecords([record, ...records]);
      await Promise.all(attachments.map((attachment) => rm(metadataPath(attachment.id), { force: true }).catch(() => undefined)));
      return record;
    } catch (error) {
      await Promise.all(moved.map((attachment) => rename(mediaFilePath(attachment.id), path.join(pendingDirectory(), attachment.id)).catch(() => undefined)));
      throw error;
    }
  });
}

export async function deleteSubmission(id: string) {
  return withStorageLock(async () => {
    const records = await readRecords();
    const record = records.find((item) => item.id === id);
    if (!record) return false;
    await writeRecords(records.filter((item) => item.id !== id));
    await Promise.all(record.attachments.map((attachment) => rm(mediaFilePath(attachment.id), { force: true })));
    return true;
  });
}

export async function deleteAllSubmissions() {
  return withStorageLock(async () => {
    const records = await readRecords();
    await writeRecords([]);
    await rm(mediaDirectory(), { recursive: true, force: true });
    await ensureDirectories();
    return records.length;
  });
}
