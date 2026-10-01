export type Activity = 'holiday' | 'poem';
export type AttachmentKind = 'image' | 'video';

export const MAX_IMAGE_BYTES = 50 * 1024 * 1024;
export const MAX_PHOTO_IMAGES = 5;
export const MAX_COLLECTION_IMAGES = 10;

export interface AttachmentMeta {
  id: string;
  name: string;
  type: string;
  size: number;
  kind: AttachmentKind;
}

export interface Submission {
  id: string;
  createdAt: string;
  activity: Activity;
  name: string;
  className: string;
  contact: string;
  format: string;
  otherFormat: string;
  title: string;
  copy: string;
  attachments: AttachmentMeta[];
}

export const ACTIVITY_LABELS: Record<Activity, string> = {
  holiday: '晒晒我的国庆假期',
  poem: '我为祖国写首诗',
};

export const FORMATS_BY_ACTIVITY: Record<Activity, string[]> = {
  holiday: ['照片', '短视频', '手账', '绘画', '摄影组图', '其他'],
  poem: ['诗歌', '手写诗稿 / 插图', '其他'],
};
