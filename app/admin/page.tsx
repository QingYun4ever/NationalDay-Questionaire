'use client';

import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import type { Activity, AttachmentMeta, Submission } from '@/lib/submissions';
import { ACTIVITY_LABELS } from '@/lib/submissions';
import './admin.css';

function displayDate(value: string) {
  return new Intl.DateTimeFormat('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).format(new Date(value));
}

function displaySize(bytes: number) {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function downloadFile(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

function MediaPreview({ attachment, onClose }: { attachment: AttachmentMeta; onClose: () => void }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  useEffect(() => { dialogRef.current?.showModal(); }, []);
  const url = `/api/admin/media/${encodeURIComponent(attachment.id)}`;
  return <dialog className="admin-preview" ref={dialogRef} onClose={onClose} onClick={(event) => { if (event.target === event.currentTarget) dialogRef.current?.close(); }}>
    <div className="admin-preview-content"><header><strong>{attachment.name}</strong><button type="button" autoFocus onClick={() => dialogRef.current?.close()} aria-label="关闭预览">×</button></header>
      {attachment.kind === 'video' ? <video controls autoPlay playsInline src={url} /> : <img src={url} alt={attachment.name} />}
      <footer><a href={`${url}?download=1`}>下载原文件 · {displaySize(attachment.size)}</a><span>按 Esc 关闭预览</span></footer>
    </div>
  </dialog>;
}

export default function AdminPage() {
  const [authorized, setAuthorized] = useState<boolean | null>(null);
  const [password, setPassword] = useState('');
  const [records, setRecords] = useState<Submission[]>([]);
  const [query, setQuery] = useState('');
  const [activity, setActivity] = useState<'all' | Activity>('all');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<AttachmentMeta | null>(null);

  async function loadRecords() {
    const response = await fetch('/api/admin/submissions', { cache: 'no-store' });
    if (response.status === 401) {
      setAuthorized(false);
      return;
    }
    const result = await response.json() as { submissions?: Submission[]; error?: string };
    if (!response.ok) throw new Error(result.error || '读取投稿列表失败');
    setRecords(result.submissions ?? []);
    setAuthorized(true);
  }

  useEffect(() => {
    let active = true;
    fetch('/api/admin/submissions', { cache: 'no-store' }).then(async (response) => {
      if (!active) return;
      if (response.status === 401) {
        setAuthorized(false);
        return;
      }
      const result = await response.json() as { submissions?: Submission[]; error?: string };
      if (!active) return;
      if (!response.ok) throw new Error(result.error || '读取投稿列表失败');
      setRecords(result.submissions ?? []);
      setAuthorized(true);
    }).catch((reason: unknown) => {
      if (active) {
        setAuthorized(false);
        setError(reason instanceof Error ? reason.message : '连接服务器失败');
      }
    });
    return () => { active = false; };
  }, []);

  async function login(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      const response = await fetch('/api/admin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error || '登录失败');
      setPassword('');
      await loadRecords();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '登录失败');
    } finally {
      setBusy(false);
    }
  }

  async function logout() {
    await fetch('/api/admin/logout', { method: 'POST' });
    setRecords([]);
    setAuthorized(false);
    setError('');
  }

  async function removeRecord(record: Submission) {
    if (!window.confirm(`确定删除「${record.title}」和全部附件？此操作无法撤销。`)) return;
    setBusy(true);
    try {
      const response = await fetch(`/api/admin/submissions/${encodeURIComponent(record.id)}`, { method: 'DELETE' });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error || '删除失败');
      setRecords((current) => current.filter((item) => item.id !== record.id));
      setError('投稿和附件已删除。');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '删除失败');
    } finally {
      setBusy(false);
    }
  }

  async function removeAll() {
    if (!records.length || !window.confirm(`确定清空服务器上的 ${records.length} 件投稿及所有附件？此操作无法撤销。`)) return;
    setBusy(true);
    try {
      const response = await fetch('/api/admin/submissions', { method: 'DELETE' });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error || '清空投稿失败');
      setRecords([]);
      setError('所有投稿和附件已清空。');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '清空投稿失败');
    } finally {
      setBusy(false);
    }
  }

  const visibleRecords = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase();
    return records.filter((record) => {
      if (activity !== 'all' && record.activity !== activity) return false;
      if (!normalized) return true;
      return [record.name, record.className, record.contact, record.title, record.copy, record.otherFormat]
        .some((value) => value.toLocaleLowerCase().includes(normalized));
    });
  }, [records, query, activity]);

  function exportJson() {
    if (!records.length) return;
    downloadFile(new Blob([JSON.stringify({ exportedAt: new Date().toISOString(), submissions: records }, null, 2)], { type: 'application/json;charset=utf-8' }), '国庆征集-投稿记录.json');
    setError('JSON 已导出；原始附件请在作品卡片内逐个下载。');
  }

  function exportCsv() {
    if (!records.length) return;
    const quote = (value: unknown) => {
      let text = String(value ?? '');
      if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
      return `"${text.replace(/"/g, '""')}"`;
    };
    const rows = [
      ['提交时间', '活动', '姓名', '班级', '联系方式', '作品形式', '作品标题', '文案', '附件数量', '附件文件名'],
      ...records.map((record) => [
        displayDate(record.createdAt), ACTIVITY_LABELS[record.activity], record.name, record.className,
        record.contact, record.format === '其他' ? `其他（${record.otherFormat}）` : record.format,
        record.title, record.copy, record.attachments.length, record.attachments.map((item) => item.name).join('、'),
      ]),
    ];
    downloadFile(new Blob([`\ufeff${rows.map((row) => row.map(quote).join(',')).join('\r\n')}`], { type: 'text/csv;charset=utf-8' }), '国庆征集-投稿记录.csv');
    setError('CSV 已导出；原始附件请在作品卡片内逐个下载。');
  }

  if (authorized === null) return <main className="admin-loading">正在连接管理后台…</main>;
  if (!authorized) {
    return (
      <main className="admin-login-page">
        <a className="admin-back" href="/">← 返回征集页面</a>
        <section className="admin-login-card">
          <span className="admin-mark">管</span>
          <p className="admin-eyebrow">SUBMISSION CONSOLE</p>
          <h1>作品管理后台</h1>
          <p className="admin-login-intro">登录后查看和管理保存在征集服务器上的投稿。</p>
          <form onSubmit={login}>
            <label htmlFor="admin-password">管理密码</label>
            <input id="admin-password" type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} required />
            <button className="admin-primary" disabled={busy}>{busy ? '正在登录…' : '登录后台'} <span aria-hidden="true">↗</span></button>
          </form>
          {error && <p className="admin-message" role="status">{error}</p>}
          <p className="admin-login-hint">首次部署请在服务器环境中配置 ADMIN_PASSWORD 和 ADMIN_SESSION_SECRET。</p>
        </section>
      </main>
    );
  }

  return (
    <main className="admin-shell">
      <header className="admin-header">
        <a className="admin-brand" href="/">国庆作品征集 <span>/ 管理后台</span></a>
        <button className="admin-logout" type="button" onClick={logout}>退出登录</button>
      </header>
      <section className="admin-main">
        <div className="admin-title-row">
          <div><p className="admin-eyebrow">SUBMISSIONS · ADMIN</p><h1>投稿管理</h1><p className="admin-subtitle">服务器共收录 <strong>{records.length}</strong> 件作品</p></div>
          <div className="admin-export"><button type="button" onClick={exportJson}>导出 JSON</button><button type="button" onClick={exportCsv}>导出 CSV</button><button className="admin-danger" type="button" onClick={removeAll} disabled={!records.length || busy}>清空全部</button></div>
        </div>
        <div className="admin-toolbar">
          <label className="admin-search"><span aria-hidden="true">⌕</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索姓名、班级、标题或联系方式" aria-label="搜索投稿" /></label>
          <select value={activity} onChange={(event) => setActivity(event.target.value as 'all' | Activity)} aria-label="按活动筛选">
            <option value="all">全部活动</option><option value="holiday">{ACTIVITY_LABELS.holiday}</option><option value="poem">{ACTIVITY_LABELS.poem}</option>
          </select>
          <span className="admin-filter-count">显示 {visibleRecords.length} / {records.length}</span>
        </div>
        {error && <p className="admin-message admin-message--inline" role="status">{error}</p>}
        {visibleRecords.length ? <div className="admin-record-list">
          {visibleRecords.map((record) => <article className="admin-record" key={record.id}>
            <div className="admin-record__top"><span className={`admin-tag ${record.activity === 'poem' ? 'admin-tag--poem' : ''}`}>{ACTIVITY_LABELS[record.activity]}</span><time dateTime={record.createdAt}>{displayDate(record.createdAt)}</time></div>
            <div className="admin-record__heading"><div><h2>{record.title}</h2><p>{[record.name, record.className, record.contact].filter(Boolean).join(' · ')}</p></div><button className="admin-delete" type="button" disabled={busy} onClick={() => removeRecord(record)}>删除</button></div>
            <p className="admin-format">作品形式：{record.format === '其他' && record.otherFormat ? `其他（${record.otherFormat}）` : record.format}</p>
            {record.copy && (record.activity === 'poem' ? <blockquote className="admin-poem"><span className="admin-poem-quote" aria-hidden="true">“</span><p>{record.copy}</p><span className="admin-poem-quote admin-poem-quote--closing" aria-hidden="true">”</span></blockquote> : <p className="admin-copy">{record.copy}</p>)}
            {record.attachments.length > 0 && <div className="admin-attachments">{record.attachments.map((attachment) => {
              const mediaUrl = `/api/admin/media/${encodeURIComponent(attachment.id)}`;
              return <div className={attachment.kind === 'video' ? 'admin-video' : 'admin-image'} key={attachment.id}>
                <button className="admin-preview-trigger" type="button" onClick={() => setPreview(attachment)} aria-label={`预览${attachment.kind === 'video' ? '视频' : '图片'}：${attachment.name}`}>
                  {attachment.kind === 'video' ? <span className="admin-video-preview-mark">▶ 点击播放预览</span> : <img src={mediaUrl} alt={attachment.name} loading="lazy" />}
                </button><a href={`${mediaUrl}?download=1`}>下载{attachment.kind === 'video' ? '视频' : '原图'} · {displaySize(attachment.size)} · {attachment.name}</a>
              </div>;
            })}</div>}
          </article>)}
        </div> : <div className="admin-empty">{records.length ? '没有符合筛选条件的投稿。' : '暂无投稿。新投稿会自动保存在服务器数据卷中。'}</div>}
      </section>
      <footer className="admin-footer">原始图片和视频保存在服务器 DATA_DIR；删除投稿会一并删除附件。</footer>
      {preview && <MediaPreview attachment={preview} onClose={() => setPreview(null)} />}
    </main>
  );
}
