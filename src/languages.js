// 语种配置：与市场完全解耦，市场只引用语种代码
export const DEFAULT_LANGUAGE = 'zh';

export const LANGUAGES = {
  zh: { code: 'zh', label: '中文', nativeLabel: '中文', flag: '🇨🇳' },
  en: { code: 'en', label: '英语', nativeLabel: 'English', flag: '🇺🇸' },
  ja: { code: 'ja', label: '日语', nativeLabel: '日本語', flag: '🇯🇵' },
};

export const LANGUAGE_ORDER = ['zh', 'en', 'ja'];

/**
 * 回退链：目标语种字段为空时，按顺序找第一个非空值。
 * 规则：回退只填补空字段，绝不覆盖目标语种已有值（含人工锁定值）。
 * 默认语种 zh 作为最终兜底，由 resolve 逻辑自动追加，无需在此重复声明。
 */
export const FALLBACK_CHAIN = {
  zh: [],
  en: ['zh'],
  ja: ['en', 'zh'],
};
