'use client';

import { useState } from 'react';
import { ACTIVITY_LABELS } from '@/lib/submissions';
import './original-home.css';

export default function OriginalHome({ countdown }: { countdown: { days: number; hours: number; minutes: number } | null }) {
  const [tab, setTab] = useState(0);
  return <div className="original-home">
    <header className="original-hero">
      <div className="original-shell original-hero-grid">
        <div>
          <p className="original-badge">🎉 这个国庆，让我们用镜头与文字向祖国告白</p>
          <h1>我和我的<em>祖国</em><br />国庆主题作品征集</h1>
          <p className="original-lede">国庆假期你去过哪里？拍下了哪些照片？遇见了怎样的人与事？又有哪些瞬间让你感受到祖国的美好、家乡的变化、青春的力量？</p>
          <ul className="original-chips"><li><span>征集对象</span><strong>全校师生</strong></li><li><span>投稿时间</span><strong>即日起至 10 月 7 日</strong></li></ul>
          <div className="original-actions"><a className="original-button original-button-primary" href="#submit">我要投稿 ↓</a><a className="original-button" href="#activities">先看活动详情</a></div>
        </div>
        <aside className="original-cards" aria-label="两个活动概览">
          <div className="original-glass"><span>活动一</span><h2>{ACTIVITY_LABELS.holiday}</h2><p>照片、短视频、手账、绘画——用镜头留住那些瞬间。</p></div>
          <div className="original-glass"><span>活动二</span><h2>我为祖国写首诗</h2><p>诗体不限、字数不限，写下心中那一抹「中国红」。</p></div>
        </aside>
      </div>
    </header>
    <div className="original-shell">
      <section className="original-countdown original-glass" aria-label="投稿倒计时"><strong>距投稿截止还有</strong><span>{countdown ? `${countdown.days} 天 ${countdown.hours} 时 ${countdown.minutes} 分` : '—'}</span><small>截稿时间 10 月 7 日 23:59（北京时间）</small></section>
      <section className="original-activities" id="activities" aria-labelledby="activities-title">
        <h2 id="activities-title">两个活动，任选其一或都参与</h2><p>用你最擅长的方式表达——镜头，或者文字。</p>
        <div className="original-tabs" role="tablist" aria-label="活动选择">{[ACTIVITY_LABELS.holiday, ACTIVITY_LABELS.poem].map((label, index) => <button key={label} type="button" role="tab" id={`activity-tab-${index}`} aria-selected={tab === index} aria-controls={`activity-panel-${index}`} tabIndex={tab === index ? 0 : -1} onClick={() => setTab(index)} onKeyDown={(event) => { if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) { event.preventDefault(); const next = event.key === 'Home' ? 0 : event.key === 'End' ? 1 : 1 - tab; setTab(next); document.getElementById(`activity-tab-${next}`)?.focus(); } }}><span>活动{index === 0 ? '一' : '二'}</span><strong>{label}</strong></button>)}</div>
        <div className="original-panel original-glass" role="tabpanel" id="activity-panel-0" aria-labelledby="activity-tab-0" hidden={tab !== 0}>
          <div>
            <h3>❤️ 活动一 · {ACTIVITY_LABELS.holiday}</h3>
            <p>家国情怀，不只在远方的山河，也在我们身边的每一个瞬间。</p>
            <p>它可以是一处承载历史记忆的红色地标，一座令人肃然起敬的人物雕塑；可以是旅途中遇见的壮美风景、家乡日新月异的变化，或是一件让你感受到时代发展与祖国力量的小事。</p>
            <p>用镜头记录所见，或用文字写下所感，分享属于你的家国记忆。</p>
            <h4>作品形式</h4><ul><li>照片 <strong>1—5 张</strong> / 短视频（<strong>2 分钟以内</strong>），可配简短文案</li><li>手账、绘画、摄影组图等创意形式也可；摄影组图最多 <strong>10 张</strong></li></ul>
          </div>
          <aside><h4>作品要求</h4><ul><li>原创</li><li>画面清晰</li><li>内容积极向上</li></ul></aside>
        </div>
        <div className="original-panel original-glass" role="tabpanel" id="activity-panel-1" aria-labelledby="activity-tab-1" hidden={tab !== 1}>
          <div>
            <h3>❤️ 活动二 · {ACTIVITY_LABELS.poem}</h3>
            <p>用一首原创小诗，写下你心中的中国。</p>
            <p>你可以写祖国的壮美山河与家乡变化，也可以写英雄人物、时代榜样、校园生活、青春成长，或是记忆中、生活里那一抹鲜亮的“中国红”。</p>
            <p>诗体不限，字数不限。可以配手写诗稿照片、绘画或插图，让文字与画面共同表达真情实感。</p>
          </div>
          <aside><h4>作品要求</h4><ul><li>原创</li><li>真情实感</li><li>字数不限、诗体不限</li><li>可配手写照片或插图</li></ul></aside>
        </div>
      </section>
    </div>
  </div>;
}
