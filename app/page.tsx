'use client';

import { type ChangeEvent, type FormEvent, useEffect, useRef, useState } from 'react';
import type { Activity, AttachmentMeta } from '@/lib/submissions';
import { FORMATS_BY_ACTIVITY, MAX_IMAGE_BYTES, MAX_PHOTO_IMAGES, MAX_COLLECTION_IMAGES } from '@/lib/submissions';
import OriginalHome from './original-home';

const MAX_VIDEO_SECONDS = 120;

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

async function uploadMedia(file: File): Promise<AttachmentMeta> {
  const response = await fetch('/api/uploads', {
    method: 'POST',
    headers: {
      'Content-Type': file.type || 'application/octet-stream',
      'X-Upload-Name': encodeURIComponent(file.name),
    },
    body: file,
  });
  const result = await response.json() as AttachmentMeta & { error?: string };
  if (!response.ok) throw new Error(result.error || '附件上传失败');
  return result;
}

async function discardUploads(attachments: AttachmentMeta[]) {
  await Promise.all(attachments.map((attachment) => fetch(`/api/uploads/${encodeURIComponent(attachment.id)}`, { method: 'DELETE' })));
}

async function measureVideoSeconds(file: File): Promise<number> {
  const url = URL.createObjectURL(file);
  try {
    const { promise, resolve, reject } = Promise.withResolvers<number>();
    const video = document.createElement('video');
    video.preload = 'metadata';
    video.onloadedmetadata = () => resolve(video.duration);
    video.onerror = () => reject(new Error('无法读取视频时长，请换一个视频文件'));
    video.src = url;
    return await promise;
  } finally {
    URL.revokeObjectURL(url);
  }
}

export default function Home() {
  const formRef = useRef<HTMLFormElement>(null);
  const [activity, setActivity] = useState<Activity>('holiday');
  const [format, setFormat] = useState('照片');
  const [name, setName] = useState('');
  const [className, setClassName] = useState('');
  const [contact, setContact] = useState('');
  const [title, setTitle] = useState('');
  const [copy, setCopy] = useState('');
  const [otherFormat, setOtherFormat] = useState('');
  const [images, setImages] = useState<AttachmentMeta[]>([]);
  const [video, setVideo] = useState<AttachmentMeta | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);
  const [maxFileMb, setMaxFileMb] = useState(250);
  const [remaining, setRemaining] = useState<number | null>(null);
  const [successFeedback, setSuccessFeedback] = useState<{ id: number; message: string } | null>(null);

  useEffect(() => {
    let active = true;
    const updateCountdown = () => setRemaining(Math.max(0, new Date('2026-10-07T23:59:59+08:00').getTime() - Date.now()));
    updateCountdown();
    const timer = window.setInterval(updateCountdown, 60_000);
    fetch('/api/uploads').then(async (response) => {
      if (!response.ok) return;
      const result = await response.json() as { maxFileMb?: number };
      if (active && Number.isInteger(result.maxFileMb) && result.maxFileMb && result.maxFileMb > 0) setMaxFileMb(result.maxFileMb);
    }).catch(() => undefined);
    return () => { active = false; window.clearInterval(timer); };
  }, []);

  useEffect(() => {
    if (!successFeedback) return;
    const timer = window.setTimeout(() => setSuccessFeedback(null), 4500);
    return () => window.clearTimeout(timer);
  }, [successFeedback]);

  const requiredImage = (activity === 'holiday' && format !== '短视频') || (activity === 'poem' && format === '手写诗稿 / 插图');
  const maxImages = format === '摄影组图' ? MAX_COLLECTION_IMAGES : MAX_PHOTO_IMAGES;

  function clearError(field: string) {
    setErrors((previous) => ({ ...previous, [field]: '' }));
  }

  function resetForm() {
    void discardUploads([...images, ...(video ? [video] : [])]).catch(() => undefined);
    formRef.current?.reset();
    setActivity('holiday');
    setFormat('照片');
    setName('');
    setClassName('');
    setContact('');
    setTitle('');
    setCopy('');
    setOtherFormat('');
    setImages([]);
    setVideo(null);
    setErrors({});
    setStatus('');
  }

  async function onImagesSelected(event: ChangeEvent<HTMLInputElement>) {
    const selected = Array.from(event.target.files ?? []);
    event.target.value = '';
    if (!selected.length) return;
    if (selected.some((file) => !file.type.startsWith('image/'))) {
      setErrors((old) => ({ ...old, images: '请选择图片文件。' }));
      return;
    }
    if (selected.some((file) => file.size > MAX_IMAGE_BYTES)) {
      setErrors((old) => ({ ...old, images: '单张图片不能超过 50 MB，请重新选择。' }));
      return;
    }
    const room = maxImages - images.length;
    if (room <= 0) {
      setErrors((old) => ({ ...old, images: `最多上传 ${maxImages} 张图片。` }));
      return;
    }
    const accepted = selected.slice(0, room);
    setBusy(true);
    setStatus('正在将原图上传到活动服务器…');
    const uploaded: AttachmentMeta[] = [];
    try {
      for (const file of accepted) uploaded.push(await uploadMedia(file));
      setImages((current) => [...current, ...uploaded]);
      if (selected.length > room) setErrors((old) => ({ ...old, images: `最多 ${maxImages} 张，本次只添加前 ${room} 张。` }));
      else clearError('images');
      setStatus(uploaded.length ? '图片原文件已保存到活动服务器，未压缩。' : '');
      if (uploaded.length) setSuccessFeedback({ id: Date.now(), message: '原图上传成功' });
    } catch (error) {
      setImages((current) => [...current, ...uploaded]);
      setErrors((old) => ({ ...old, images: error instanceof Error ? error.message : '图片上传失败，请重试。' }));
      setStatus('');
    } finally {
      setBusy(false);
    }
  }

  async function onVideoSelected(event: ChangeEvent<HTMLInputElement>) {
    const selected = event.target.files?.[0] ?? null;
    event.target.value = '';
    if (!selected) return;
    if (!selected.type.startsWith('video/')) {
      setErrors((old) => ({ ...old, video: '请选择视频文件。' }));
      return;
    }
    setBusy(true);
    setStatus('正在检查视频时长…');
    try {
      const duration = await measureVideoSeconds(selected);
      if (!Number.isFinite(duration)) throw new Error('无法读取视频时长，请换一个视频文件');
      if (duration > MAX_VIDEO_SECONDS) throw new Error('视频时长不能超过 2 分钟，请剪辑后重新选择');
      setStatus('正在将视频原文件上传到活动服务器…');
      setVideo(await uploadMedia(selected));
      clearError('video');
      setStatus('视频原文件已保存到活动服务器，未压缩。');
      setSuccessFeedback({ id: Date.now(), message: '视频上传成功' });
    } catch (error) {
      setVideo(null);
      setErrors((old) => ({ ...old, video: error instanceof Error ? error.message : '视频上传失败' }));
      setStatus('');
    } finally {
      setBusy(false);
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextErrors: Record<string, string> = {};
    if (!name.trim()) nextErrors.name = '请填写姓名。';
    if (!className.trim()) nextErrors.className = '请填写班级。';
    if (!contact.trim()) nextErrors.contact = '请填写微信号。';
    if (activity === 'poem' && !copy.trim()) nextErrors.copy = '请填写诗歌正文。';
    if (!format) nextErrors.format = '请选择作品形式。';
    if (format === '其他' && !otherFormat.trim()) nextErrors.otherFormat = '请填写作品形式。';
    if (!title.trim()) nextErrors.title = '请填写作品标题。';
    if (requiredImage && !images.length) nextErrors.images = '请至少选择 1 张图片。';
    if (format === '短视频' && !video) nextErrors.video = '请选择一个不超过 2 分钟的视频。';
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length) {
      setStatus('请检查表单中标记的内容。');
      return;
    }

    setBusy(true);
    setStatus('正在提交投稿…');
    try {
      const response = await fetch('/api/submissions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          activity,
          name: name.trim(),
          className: className.trim(),
          contact: contact.trim(),
          format,
          otherFormat: otherFormat.trim(),
          title: title.trim(),
          copy: copy.trim(),
          attachmentIds: (format === '短视频' && video ? [video] : images).map((attachment) => attachment.id),
        }),
      });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error || '投稿保存失败，请重试');
      formRef.current?.reset();
      setActivity('holiday');
      setFormat('照片');
      setName('');
      setClassName('');
      setContact('');
      setTitle('');
      setCopy('');
      setOtherFormat('');
      setImages([]);
      setVideo(null);
      setErrors({});
      setStatus('投稿成功，作品及原始附件已保存到征集活动服务器。');
      setSuccessFeedback({ id: Date.now(), message: '投稿成功，感谢你的国庆心意！' });
    } catch (error) {
      setStatus(`投稿失败：${error instanceof Error ? error.message : '请检查网络后重试。'}`);
    } finally {
      setBusy(false);
    }
  }

  function discardAttachment(attachment: AttachmentMeta) {
    void discardUploads([attachment]).catch(() => undefined);
    if (attachment.kind === 'video') setVideo(null);
    else setImages((current) => current.filter((item) => item.id !== attachment.id));
  }

  function changeActivity(nextActivity: Activity) {
    void discardUploads([...images, ...(video ? [video] : [])]).catch(() => undefined);
    setActivity(nextActivity);
    setFormat(nextActivity === 'poem' ? '诗歌' : '照片');
    setImages([]);
    setVideo(null);
    setErrors({});
  }

  function changeFormat(nextFormat: string) {
    void discardUploads([...images, ...(video ? [video] : [])]).catch(() => undefined);
    setFormat(nextFormat);
    setImages([]);
    setVideo(null);
    setErrors((old) => ({ ...old, format: '', images: '', video: '' }));
  }

  const countdown = remaining === null ? null : {
    days: Math.floor(remaining / 86_400_000),
    hours: Math.floor((remaining % 86_400_000) / 3_600_000),
    minutes: Math.floor((remaining % 3_600_000) / 60_000),
  };

  return (
    <main className="site-shell">
      <OriginalHome countdown={countdown} />

      <section className="content-section" id="submit" aria-labelledby="submit-title">
        <div className="section-heading"><div><p className="section-kicker">YOUR STORY, YOUR VOICE</p><h2 id="submit-title">提交一份国庆心意</h2></div><span className="section-index">01 <i>/ 投稿</i></span></div>
        <form className="submission-form" ref={formRef} onSubmit={handleSubmit} noValidate>
          <fieldset className="form-fields" disabled={busy}>
          <section className="form-group" aria-labelledby="person-heading">
            <div className="form-group__heading"><span className="step-number">01</span><div><h3 id="person-heading">投稿人信息</h3><p>留下你的姓名和班级</p></div></div>
            <div className="field-grid field-grid--three">
              <div className="field"><label htmlFor="name">姓名 <span className="required">*</span></label><input id="name" name="name" autoComplete="name" maxLength={20} value={name} onChange={(event) => { setName(event.target.value); clearError('name'); }} aria-invalid={!!errors.name} placeholder="请输入姓名" />{errors.name && <small className="field-error">{errors.name}</small>}</div>
              <div className="field"><label htmlFor="className">班级 <span className="required">*</span></label><input id="className" name="className" maxLength={40} value={className} onChange={(event) => { setClassName(event.target.value); clearError('className'); }} aria-invalid={!!errors.className} placeholder="如：高二（3）班" />{errors.className && <small className="field-error">{errors.className}</small>}</div>
              <div className="field"><label htmlFor="contact">微信号 <span className="required">*</span></label><input id="contact" name="contact" required maxLength={40} value={contact} onChange={(event) => { setContact(event.target.value); clearError('contact'); }} aria-invalid={!!errors.contact} placeholder="请输入微信号" />{errors.contact && <small className="field-error">{errors.contact}</small>}</div>
            </div>
          </section>

          <section className="form-group" aria-labelledby="work-heading">
            <div className="form-group__heading"><span className="step-number">02</span><div><h3 id="work-heading">作品信息</h3><p>选择活动和作品形式</p></div></div>
            <div className="field-grid field-grid--two">
              <div className="field"><label htmlFor="activity">投稿活动 <span className="required">*</span></label><select id="activity" name="activity" value={activity} onChange={(event) => changeActivity(event.target.value as Activity)}><option value="holiday">活动一 · 晒晒我的国庆假期</option><option value="poem">活动二 · 我为祖国写首诗</option></select></div>
              <div className="field"><label htmlFor="format">作品形式 <span className="required">*</span></label><select id="format" name="format" value={format} onChange={(event) => changeFormat(event.target.value)} aria-invalid={!!errors.format}><option value="" disabled>请选择作品形式</option>{FORMATS_BY_ACTIVITY[activity].map((item) => <option key={item} value={item}>{item}</option>)}</select>{errors.format && <small className="field-error">{errors.format}</small>}</div>
              {format === '其他' && <div className="field field--wide"><label htmlFor="otherFormat">其他作品形式 <span className="required">*</span></label><input id="otherFormat" value={otherFormat} maxLength={30} onChange={(event) => { setOtherFormat(event.target.value); clearError('otherFormat'); }} aria-invalid={!!errors.otherFormat} placeholder="请填写作品形式" />{errors.otherFormat && <small className="field-error">{errors.otherFormat}</small>}</div>}
              <div className="field field--wide"><label htmlFor="title">作品标题 <span className="required">*</span></label><input id="title" name="title" maxLength={60} value={title} onChange={(event) => { setTitle(event.target.value); clearError('title'); }} aria-invalid={!!errors.title} placeholder="给你的作品起个名字" />{errors.title && <small className="field-error">{errors.title}</small>}</div>
              <div className="field field--wide"><label htmlFor="copy">{activity === 'poem' ? '诗歌正文' : '作品文案'} {activity === 'poem' ? <span className="required">*</span> : <span className="optional">选填</span>}</label><textarea id="copy" name="copy" rows={6} required={activity === 'poem'} value={copy} onChange={(event) => { setCopy(event.target.value); clearError('copy'); }} aria-invalid={!!errors.copy} placeholder={activity === 'poem' ? '请写下你的原创诗歌，诗体不限、字数不限。' : '为作品写一段简短介绍（选填）'} /><span className="field-count">{copy.length} 字</span>{errors.copy && <small className="field-error">{errors.copy}</small>}</div>
            </div>
          </section>

          <section className="form-group" aria-labelledby="attachment-heading">
            <div className="form-group__heading"><span className="step-number">03</span><div><h3 id="attachment-heading">作品附件 {activity === 'holiday' || requiredImage ? <span className="required">*</span> : <span className="optional">选填附件</span>}</h3><p>图片原图保存；短视频限 2 分钟以内</p></div></div>
            {format === '短视频' ? <div className="upload-zone">
              <label className="upload-picker" htmlFor="video-file"><span className="upload-icon">▶</span><span><strong>选择短视频</strong><small>常见视频格式 · 最长 2 分钟 · 单个文件最大 {maxFileMb} MB</small></span><span className="upload-action">浏览文件</span></label>
              <input className="visually-hidden" id="video-file" type="file" accept="video/*" disabled={busy} onChange={onVideoSelected} aria-describedby="video-help" />
              <p className="upload-help" id="video-help">视频原文件直接保存在征集服务器，不会压缩。</p>
              {video && <div className="file-row"><span className="file-row__type">视频</span><span className="file-row__name">{video.name}</span><span className="file-row__size">{formatBytes(video.size)}</span><button type="button" disabled={busy} onClick={() => discardAttachment(video)} aria-label="移除视频">移除</button></div>}
              {errors.video && <small className="field-error">{errors.video}</small>}
            </div> : <div className="upload-zone">
              <label className="upload-picker" htmlFor="image-files"><span className="upload-icon">＋</span><span><strong>选择图片</strong><small>最多 {maxImages} 张 · 保留原图、不压缩 · 单张最大 50 MB</small></span><span className="upload-action">浏览文件</span></label>
              <input className="visually-hidden" id="image-files" type="file" accept="image/*" multiple disabled={busy} onChange={onImagesSelected} aria-describedby="image-help" />
              <p className="upload-help" id="image-help">手账、绘画、诗歌手稿等图片作品也可在这里添加。</p>
              {images.map((image) => <div className="file-row" key={image.id}><span className="file-row__type">图片</span><span className="file-row__name">{image.name}</span><span className="file-row__size">{formatBytes(image.size)}</span><button type="button" disabled={busy} onClick={() => discardAttachment(image)} aria-label={`移除图片 ${image.name}`}>移除</button></div>)}
              {errors.images && <small className="field-error">{errors.images}</small>}
            </div>}
          </section>
</fieldset>

          <div className="form-submit-row"><p>作品及附件会保存到<strong>征集活动服务器</strong>，由活动管理员统一管理。</p><div className="form-actions"><button className="button button--quiet" type="button" onClick={resetForm} disabled={busy}>清空重填</button><button className="button button--primary" type="submit" disabled={busy}>{busy ? '正在保存…' : '提交投稿'} <span aria-hidden="true">↗</span></button></div></div>
          <p className="form-status" role="status" aria-live="polite">{status}</p>
        </form>
      </section>

      {successFeedback && <div className="upload-success" role="status" key={successFeedback.id}><span className="upload-success-check" aria-hidden="true">✓</span><strong>{successFeedback.message}</strong><div className="success-sparks" aria-hidden="true">{Array.from({ length: 10 }, (_, index) => <i key={index} style={{ '--spark-angle': `${index * 36}deg` } as React.CSSProperties} />)}</div></div>}
    </main>
  );
}
