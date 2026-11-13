// 市场配置：单位、长度限制、禁用词、类目映射均按市场独立；语种仅引用语种代码
export const CATALOG_VERSION = '2026.11.0-r1';

export const MARKETS = {
  CN: {
    code: 'CN',
    name: '中国大陆',
    languages: ['zh', 'en'],
    defaultLanguage: 'zh',
    units: ['件', '盒', '箱', '瓶', '袋', '罐', '千克', '克'],
    limits: { title: 60, description: 300 },
    bannedWords: ['最', '第一', '顶级', '国家级', '万能'],
    categoryMap: {
      electronics: '数码家电',
      home: '家居生活',
      food: '食品饮料',
      beverage: '酒水饮料',
    },
  },
  US: {
    code: 'US',
    name: '美国',
    languages: ['en', 'zh'],
    defaultLanguage: 'en',
    units: ['piece', 'box', 'case', 'bottle', 'bag', 'can', 'kg', 'g'],
    limits: { title: 80, description: 500 },
    bannedWords: ['best', '#1', 'top-rated', 'cure', 'miracle'],
    categoryMap: {
      electronics: 'Electronics',
      home: 'Home & Kitchen',
      food: 'Grocery & Gourmet Food',
      beverage: 'Beverages',
    },
  },
  JP: {
    code: 'JP',
    name: '日本',
    languages: ['ja', 'en'],
    defaultLanguage: 'ja',
    units: ['個', '本', '袋', '箱', 'ケース', 'kg', 'g'],
    limits: { title: 50, description: 250 },
    bannedWords: ['最高', 'No.1', '一流', '治る', '奇跡', '絶対'],
    categoryMap: {
      electronics: '家電・電子機器',
      home: 'ホーム・キッチン',
      food: '食品・飲料',
      beverage: '飲料',
    },
  },
  SG: {
    code: 'SG',
    name: '新加坡',
    languages: ['en', 'zh', 'ja'],
    defaultLanguage: 'en',
    units: ['piece', 'box', 'case', 'bottle', 'bag', 'can', 'kg', 'g', '件'],
    limits: { title: 70, description: 400 },
    bannedWords: ['best', '#1', '顶级', 'cure', '治る'],
    categoryMap: {
      electronics: 'Electronics',
      home: 'Home & Kitchen',
      food: 'Grocery',
      beverage: 'Beverages',
    },
  },
};

export const MARKET_ORDER = ['CN', 'US', 'JP', 'SG'];
