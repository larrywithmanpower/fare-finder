/**
 * 可訂閱的城市清單（IATA「城市」代碼，不是機場代碼）
 *
 * 一定要用城市代碼：TYO 會涵蓋成田＋羽田，NRT 只有成田；SEL 涵蓋仁川＋金浦，
 * LON 涵蓋希斯洛＋蓋威克等。用機場代碼會查不到最便宜的票。
 *
 * ⚠️ 這份會被 scripts/build-cities.mjs 轉成 lambda/cities.json 上傳到 S3，
 *    後端寄信時用同一份翻譯，不要另外維護第二份。
 */
import type { Locale } from "./i18n";

export type City = {
  code: string;
  /** 分組 key，顯示名稱在 i18n 字典的 area.* */
  area: string;
  name: Record<Locale, string>;
};

export const CITIES: City[] = [
  { code: "TPE", area: "tw", name: { "zh-Hant": "台北", "zh-Hans": "台北", en: "Taipei", ja: "台北" } },
  { code: "KHH", area: "tw", name: { "zh-Hant": "高雄", "zh-Hans": "高雄", en: "Kaohsiung", ja: "高雄" } },
  { code: "RMQ", area: "tw", name: { "zh-Hant": "台中", "zh-Hans": "台中", en: "Taichung", ja: "台中" } },
  { code: "TYO", area: "jp", name: { "zh-Hant": "東京", "zh-Hans": "东京", en: "Tokyo", ja: "東京" } },
  { code: "OSA", area: "jp", name: { "zh-Hant": "大阪", "zh-Hans": "大阪", en: "Osaka", ja: "大阪" } },
  { code: "NGO", area: "jp", name: { "zh-Hant": "名古屋", "zh-Hans": "名古屋", en: "Nagoya", ja: "名古屋" } },
  { code: "FUK", area: "jp", name: { "zh-Hant": "福岡", "zh-Hans": "福冈", en: "Fukuoka", ja: "福岡" } },
  { code: "CTS", area: "jp", name: { "zh-Hant": "札幌", "zh-Hans": "札幌", en: "Sapporo", ja: "札幌" } },
  { code: "OKA", area: "jp", name: { "zh-Hant": "沖繩", "zh-Hans": "冲绳", en: "Okinawa", ja: "沖縄" } },
  { code: "SEL", area: "kr", name: { "zh-Hant": "首爾", "zh-Hans": "首尔", en: "Seoul", ja: "ソウル" } },
  { code: "PUS", area: "kr", name: { "zh-Hant": "釜山", "zh-Hans": "釜山", en: "Busan", ja: "釜山" } },
  { code: "HKG", area: "cn", name: { "zh-Hant": "香港", "zh-Hans": "香港", en: "Hong Kong", ja: "香港" } },
  { code: "MFM", area: "cn", name: { "zh-Hant": "澳門", "zh-Hans": "澳门", en: "Macau", ja: "マカオ" } },
  { code: "SHA", area: "cn", name: { "zh-Hant": "上海", "zh-Hans": "上海", en: "Shanghai", ja: "上海" } },
  { code: "BJS", area: "cn", name: { "zh-Hant": "北京", "zh-Hans": "北京", en: "Beijing", ja: "北京" } },
  { code: "CAN", area: "cn", name: { "zh-Hant": "廣州", "zh-Hans": "广州", en: "Guangzhou", ja: "広州" } },
  { code: "CTU", area: "cn", name: { "zh-Hant": "成都", "zh-Hans": "成都", en: "Chengdu", ja: "成都" } },
  { code: "BKK", area: "sea", name: { "zh-Hant": "曼谷", "zh-Hans": "曼谷", en: "Bangkok", ja: "バンコク" } },
  { code: "CNX", area: "sea", name: { "zh-Hant": "清邁", "zh-Hans": "清迈", en: "Chiang Mai", ja: "チェンマイ" } },
  { code: "HKT", area: "sea", name: { "zh-Hant": "普吉島", "zh-Hans": "普吉岛", en: "Phuket", ja: "プーケット" } },
  { code: "SIN", area: "sea", name: { "zh-Hant": "新加坡", "zh-Hans": "新加坡", en: "Singapore", ja: "シンガポール" } },
  { code: "KUL", area: "sea", name: { "zh-Hant": "吉隆坡", "zh-Hans": "吉隆坡", en: "Kuala Lumpur", ja: "クアラルンプール" } },
  { code: "MNL", area: "sea", name: { "zh-Hant": "馬尼拉", "zh-Hans": "马尼拉", en: "Manila", ja: "マニラ" } },
  { code: "CEB", area: "sea", name: { "zh-Hant": "宿霧", "zh-Hans": "宿务", en: "Cebu", ja: "セブ" } },
  { code: "SGN", area: "sea", name: { "zh-Hant": "胡志明市", "zh-Hans": "胡志明市", en: "Ho Chi Minh City", ja: "ホーチミン" } },
  { code: "HAN", area: "sea", name: { "zh-Hant": "河內", "zh-Hans": "河内", en: "Hanoi", ja: "ハノイ" } },
  { code: "DAD", area: "sea", name: { "zh-Hant": "峴港", "zh-Hans": "岘港", en: "Da Nang", ja: "ダナン" } },
  { code: "DPS", area: "sea", name: { "zh-Hant": "峇里島", "zh-Hans": "巴厘岛", en: "Bali", ja: "バリ" } },
  { code: "JKT", area: "sea", name: { "zh-Hant": "雅加達", "zh-Hans": "雅加达", en: "Jakarta", ja: "ジャカルタ" } },
  { code: "DEL", area: "me", name: { "zh-Hant": "德里", "zh-Hans": "德里", en: "Delhi", ja: "デリー" } },
  { code: "BOM", area: "me", name: { "zh-Hant": "孟買", "zh-Hans": "孟买", en: "Mumbai", ja: "ムンバイ" } },
  { code: "DXB", area: "me", name: { "zh-Hant": "杜拜", "zh-Hans": "迪拜", en: "Dubai", ja: "ドバイ" } },
  { code: "DOH", area: "me", name: { "zh-Hant": "杜哈", "zh-Hans": "多哈", en: "Doha", ja: "ドーハ" } },
  { code: "IST", area: "me", name: { "zh-Hant": "伊斯坦堡", "zh-Hans": "伊斯坦布尔", en: "Istanbul", ja: "イスタンブール" } },
  { code: "LON", area: "eu", name: { "zh-Hant": "倫敦", "zh-Hans": "伦敦", en: "London", ja: "ロンドン" } },
  { code: "PAR", area: "eu", name: { "zh-Hant": "巴黎", "zh-Hans": "巴黎", en: "Paris", ja: "パリ" } },
  { code: "AMS", area: "eu", name: { "zh-Hant": "阿姆斯特丹", "zh-Hans": "阿姆斯特丹", en: "Amsterdam", ja: "アムステルダム" } },
  { code: "FRA", area: "eu", name: { "zh-Hant": "法蘭克福", "zh-Hans": "法兰克福", en: "Frankfurt", ja: "フランクフルト" } },
  { code: "MUC", area: "eu", name: { "zh-Hant": "慕尼黑", "zh-Hans": "慕尼黑", en: "Munich", ja: "ミュンヘン" } },
  { code: "ZRH", area: "eu", name: { "zh-Hant": "蘇黎世", "zh-Hans": "苏黎世", en: "Zurich", ja: "チューリッヒ" } },
  { code: "VIE", area: "eu", name: { "zh-Hant": "維也納", "zh-Hans": "维也纳", en: "Vienna", ja: "ウィーン" } },
  { code: "PRG", area: "eu", name: { "zh-Hant": "布拉格", "zh-Hans": "布拉格", en: "Prague", ja: "プラハ" } },
  { code: "ROM", area: "eu", name: { "zh-Hant": "羅馬", "zh-Hans": "罗马", en: "Rome", ja: "ローマ" } },
  { code: "BCN", area: "eu", name: { "zh-Hant": "巴塞隆納", "zh-Hans": "巴塞罗那", en: "Barcelona", ja: "バルセロナ" } },
  { code: "MAD", area: "eu", name: { "zh-Hant": "馬德里", "zh-Hans": "马德里", en: "Madrid", ja: "マドリード" } },
  { code: "NYC", area: "am", name: { "zh-Hant": "紐約", "zh-Hans": "纽约", en: "New York", ja: "ニューヨーク" } },
  { code: "LAX", area: "am", name: { "zh-Hant": "洛杉磯", "zh-Hans": "洛杉矶", en: "Los Angeles", ja: "ロサンゼルス" } },
  { code: "SFO", area: "am", name: { "zh-Hant": "舊金山", "zh-Hans": "旧金山", en: "San Francisco", ja: "サンフランシスコ" } },
  { code: "SEA", area: "am", name: { "zh-Hant": "西雅圖", "zh-Hans": "西雅图", en: "Seattle", ja: "シアトル" } },
  { code: "CHI", area: "am", name: { "zh-Hant": "芝加哥", "zh-Hans": "芝加哥", en: "Chicago", ja: "シカゴ" } },
  { code: "YVR", area: "am", name: { "zh-Hant": "溫哥華", "zh-Hans": "温哥华", en: "Vancouver", ja: "バンクーバー" } },
  { code: "YTO", area: "am", name: { "zh-Hant": "多倫多", "zh-Hans": "多伦多", en: "Toronto", ja: "トロント" } },
  { code: "SYD", area: "oc", name: { "zh-Hant": "雪梨", "zh-Hans": "悉尼", en: "Sydney", ja: "シドニー" } },
  { code: "MEL", area: "oc", name: { "zh-Hant": "墨爾本", "zh-Hans": "墨尔本", en: "Melbourne", ja: "メルボルン" } },
  { code: "AKL", area: "oc", name: { "zh-Hant": "奧克蘭", "zh-Hans": "奥克兰", en: "Auckland", ja: "オークランド" } },];

const BY_CODE = new Map(CITIES.map((city) => [city.code, city]));

export function cityOf(code: string): City | undefined {
  return BY_CODE.get(code);
}

export function cityName(code: string, locale: Locale): string {
  return cityOf(code)?.name[locale] ?? code;
}

export function splitRoute(route: string): [string, string] {
  const [origin = route, destination = ""] = route.split("-");
  return [origin, destination];
}

/** "TPE-LON" -> 「台北 ✈ 倫敦」／"Taipei ✈ London"；查不到的代碼原樣顯示 */
export function routeLabel(route: string, locale: Locale): string {
  const [origin, destination] = splitRoute(route);
  return `${cityName(origin, locale)} ✈ ${cityName(destination, locale)}`;
}

/** 選單搜尋：任何一種語言的名稱或代碼都能打 */
export function matchCity(city: City, keyword: string): boolean {
  const raw = keyword.trim();
  if (!raw) return true;
  const q = raw.toLowerCase();
  if (city.code.toLowerCase().includes(q)) return true;
  return Object.values(city.name).some(
    (name) => name.toLowerCase().includes(q) || name.includes(raw),
  );
}
