// 原始目录条目（模拟 PIM/ERP 导出）：同一 productId + language 可能存在多个版本
// 字段为空串/缺省视为空字段；locked=true 表示该条目由人工锁定
import { CATALOG_VERSION } from './markets.js';

export const RAW_ENTRIES = [
  // P001 完整三语、无冲突的基准商品
  {
    productId: 'P001',
    language: 'zh',
    version: 'v1',
    title: '不锈钢保温杯 500ml',
    description: '双层真空不锈钢保温杯，保温 12 小时，容量 500 毫升，适合办公与户外使用。',
    unit: '件',
    category: 'home',
  },
  {
    productId: 'P001',
    language: 'en',
    version: 'v1',
    title: 'Stainless Steel Vacuum Bottle 500ml',
    description: 'Double-wall vacuum insulated bottle, keeps drinks hot for 12 hours. 500 ml capacity for office and outdoor use.',
    unit: 'piece',
    category: 'home',
  },
  {
    productId: 'P001',
    language: 'ja',
    version: 'v1',
    title: 'ステンレス真空ボトル 500ml',
    description: '二重構造の真空断熱ボトル。12時間保温、500ml容量でオフィスやアウトドアに最適です。',
    unit: '個',
    category: 'home',
  },

  // P002 英语描述缺失（空串）→ 应回退中文并标注来源
  {
    productId: 'P002',
    language: 'zh',
    version: 'v1',
    title: '有机燕麦片 1kg',
    description: '进口有机燕麦，无添加糖，富含膳食纤维，适合早餐冲调。',
    unit: '袋',
    category: 'food',
  },
  {
    productId: 'P002',
    language: 'en',
    version: 'v1',
    title: 'Organic Rolled Oats 1kg',
    description: '',
    unit: 'bag',
    category: 'food',
  },
  {
    productId: 'P002',
    language: 'ja',
    version: 'v1',
    title: 'オーガニックオートミール 1kg',
    description: '輸入有機オーツ使用、無糖で食物繊維たっぷり、朝食にどうぞ。',
    unit: '袋',
    category: 'food',
  },

  // P003 日语标题缺失 + 单位在日本市场不允许（「缶」不在 JP.units）
  {
    productId: 'P003',
    language: 'zh',
    version: 'v1',
    title: '冷萃咖啡饮料 24 罐整箱',
    description: '低温慢萃工艺，口感顺滑不酸涩，整箱 24 罐装。',
    unit: '箱',
    category: 'beverage',
  },
  {
    productId: 'P003',
    language: 'en',
    version: 'v1',
    title: 'Cold Brew Coffee Pack of 24',
    description: 'Slow cold-brew process with a smooth, non-bitter taste. One case contains 24 cans.',
    unit: 'case',
    category: 'beverage',
  },
  {
    productId: 'P003',
    language: 'ja',
    version: 'v1',
    title: '',
    description: '低温抽出コールドブリュー、まろやかで渋みの少ない味わい。24缶入りケース。',
    unit: '缶',
    category: 'beverage',
  },

  // P004 英语同语言两个版本，标题与描述冲突 → 进入待处理，禁止随机挑选
  {
    productId: 'P004',
    language: 'zh',
    version: 'v1',
    title: '无线降噪耳机',
    description: '主动降噪，续航 30 小时，支持蓝牙 5.3。',
    unit: '件',
    category: 'electronics',
  },
  {
    productId: 'P004',
    language: 'en',
    version: 'v1',
    title: 'Wireless Noise-Cancelling Headphones',
    description: 'Active noise cancelling with 30-hour battery life and Bluetooth 5.3.',
    unit: 'piece',
    category: 'electronics',
  },
  {
    productId: 'P004',
    language: 'en',
    version: 'v2',
    title: 'ANC Wireless Over-Ear Headphones',
    description: 'Over-ear ANC headphones, 30h playback, Bluetooth 5.3, USB-C fast charge.',
    unit: 'piece',
    category: 'electronics',
  },
  {
    productId: 'P004',
    language: 'ja',
    version: 'v1',
    title: 'ワイヤレスノイズキャンセリングヘッドホン',
    description: 'アクティブノイズキャンセリング、連続再生30時間、Bluetooth 5.3対応。',
    unit: '個',
    category: 'electronics',
  },

  // P005 中文描述超 CN 300 字限制；中文标题含禁用词「最」；类目 wellness 在部分市场无映射
  {
    productId: 'P005',
    language: 'zh',
    version: 'v1',
    title: '最新款智能体脂秤（精准家用款）',
    description:
      '本款智能体脂秤采用高灵敏度 G 型传感器与多点接触电极，可快速测量体重、体脂率、肌肉量、水分率、骨量与基础代谢等多项身体指标。配合手机应用自动生成周报与趋势曲线，帮助全家持续管理健康。钢化玻璃面板承重可达 180 千克，圆角设计防磕碰，底部防滑脚垫在瓷砖与木地板上都能稳定放置。自动开关机与低功耗蓝牙让更换一次电池可使用约九个月，提供两年质保与终身技术支持。设备支持最多八位家庭成员共用，每位成员的数据独立归档并严格隔离，访客模式可临时测量且不留存记录。配套应用还内置饮水提醒、称重目标设定与体围记录工具，帮助用户把长期健康目标拆解为可执行的每日小任务，并支持导出健康报告供体检或营养师咨询时参考，是家庭健康管理的理想入门选择。',
    unit: '件',
    category: 'wellness',
  },
  {
    productId: 'P005',
    language: 'en',
    version: 'v1',
    title: 'Smart Body Composition Scale',
    description: 'G-type sensors and multi-point electrodes measure weight, body fat, muscle mass, hydration, bone mass and BMR. Companion app generates weekly trends.',
    unit: 'piece',
    category: 'wellness',
  },

  // P006 英语标题含 US 禁用词「best」；单位 bottle 在 JP 单位表之外
  {
    productId: 'P006',
    language: 'zh',
    version: 'v1',
    title: '矿泉水 550ml × 24 瓶',
    description: '天然矿泉水，整箱 24 瓶，适合会议与日常饮用。',
    unit: '箱',
    category: 'beverage',
  },
  {
    productId: 'P006',
    language: 'en',
    version: 'v1',
    title: 'Best Natural Mineral Water 550ml 24 Bottles',
    description: 'Natural mineral water, 24 bottles per case, ideal for meetings and daily hydration.',
    unit: 'bottle',
    category: 'beverage',
  },
  {
    productId: 'P006',
    language: 'ja',
    version: 'v1',
    title: '天然ミネラルウォーター 550ml 24本',
    description: '天然ミネラルウォーター、1ケース24本入り。会議や日常の水分補給に。',
    unit: '本',
    category: 'beverage',
  },

  // P007 日语标题被人工锁定为留空（locked 且空串）：回退只能填补未锁定的空字段，不能写入锁定字段
  {
    productId: 'P007',
    language: 'zh',
    version: 'v1',
    title: '便携折叠购物袋',
    description: '可折叠收纳，防水面料，承重 10 千克。',
    unit: '件',
    category: 'home',
  },
  {
    productId: 'P007',
    language: 'en',
    version: 'v1',
    title: 'Foldable Reusable Shopping Bag',
    description: 'Foldable and waterproof, holds up to 10 kg.',
    unit: 'piece',
    category: 'home',
  },
  {
    productId: 'P007',
    language: 'ja',
    version: 'v2',
    title: '',
    description: '',
    unit: '個',
    category: 'home',
    locked: true,
  },

  // P008 日语描述超 JP 250 字限制；英语标题含 SG/US 禁用词「#1」
  {
    productId: 'P008',
    language: 'zh',
    version: 'v1',
    title: '便携蓝牙音箱',
    description: '小巧机身，360 度环绕音，IPX7 防水，续航 12 小时。',
    unit: '件',
    category: 'electronics',
  },
  {
    productId: 'P008',
    language: 'en',
    version: 'v1',
    title: '#1 Portable Bluetooth Speaker',
    description: 'Compact 360-degree speaker with IPX7 waterproofing and 12-hour playtime.',
    unit: 'piece',
    category: 'electronics',
  },
  {
    productId: 'P008',
    language: 'ja',
    version: 'v1',
    title: 'ポータブルBluetoothスピーカー',
    description:
      'コンパクトなボディから360度の臨場感あふれるサウンドを再生するポータブルBluetoothスピーカーです。IPX7等級の防水性能を備え、キッチン、お風呂、海、プール、キャンプなど水回りやアウトドアのシーンでも安心してご使用いただけます。フル充電で最長12時間の連続再生に対応し、付属のストラップでバッグやテントに簡単に取り付けられます。内蔵マイクによるハンズフリー通話や、2台をペアリングして左右のステレオ音声を楽しむモードも搭載しており、映画鑑賞やホームパーティーの演出にも最適です。本体底面には滑り止めラバーを配置し、振動を抑えてクリアな中高域と厚みのある低域を両立しました。',
    unit: '個',
    category: 'electronics',
  },
];

export const SAMPLE_SOURCE_VERSION = CATALOG_VERSION;
