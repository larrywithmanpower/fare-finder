/**
 * 可訂閱的城市清單（IATA「城市」代碼，不是機場代碼）
 *
 * 一定要用城市代碼：TYO 會涵蓋成田＋羽田，NRT 只有成田；SEL 涵蓋仁川＋金浦，
 * LON 涵蓋希斯洛＋蓋威克等。用機場代碼會查不到最便宜的票。
 *
 * ⚠️ 後端 lambda/save-subscription/index.py 的 CITIES 是同一份，加城市要兩邊都加。
 */
export type City = {
  code: string;
  zh: string;
  en: string;
  /** 分組，只用來在選單裡分隔 */
  area: string;
};

export const CITIES: City[] = [
  { code: "TPE", zh: "台北", en: "Taipei", area: "台灣" },
  { code: "KHH", zh: "高雄", en: "Kaohsiung", area: "台灣" },
  { code: "RMQ", zh: "台中", en: "Taichung", area: "台灣" },

  { code: "TYO", zh: "東京", en: "Tokyo", area: "日本" },
  { code: "OSA", zh: "大阪", en: "Osaka", area: "日本" },
  { code: "NGO", zh: "名古屋", en: "Nagoya", area: "日本" },
  { code: "FUK", zh: "福岡", en: "Fukuoka", area: "日本" },
  { code: "CTS", zh: "札幌", en: "Sapporo", area: "日本" },
  { code: "OKA", zh: "沖繩", en: "Okinawa", area: "日本" },

  { code: "SEL", zh: "首爾", en: "Seoul", area: "韓國" },
  { code: "PUS", zh: "釜山", en: "Busan", area: "韓國" },

  { code: "HKG", zh: "香港", en: "Hong Kong", area: "港澳中國" },
  { code: "MFM", zh: "澳門", en: "Macau", area: "港澳中國" },
  { code: "SHA", zh: "上海", en: "Shanghai", area: "港澳中國" },
  { code: "BJS", zh: "北京", en: "Beijing", area: "港澳中國" },
  { code: "CAN", zh: "廣州", en: "Guangzhou", area: "港澳中國" },
  { code: "CTU", zh: "成都", en: "Chengdu", area: "港澳中國" },

  { code: "BKK", zh: "曼谷", en: "Bangkok", area: "東南亞" },
  { code: "CNX", zh: "清邁", en: "Chiang Mai", area: "東南亞" },
  { code: "HKT", zh: "普吉島", en: "Phuket", area: "東南亞" },
  { code: "SIN", zh: "新加坡", en: "Singapore", area: "東南亞" },
  { code: "KUL", zh: "吉隆坡", en: "Kuala Lumpur", area: "東南亞" },
  { code: "MNL", zh: "馬尼拉", en: "Manila", area: "東南亞" },
  { code: "CEB", zh: "宿霧", en: "Cebu", area: "東南亞" },
  { code: "SGN", zh: "胡志明市", en: "Ho Chi Minh City", area: "東南亞" },
  { code: "HAN", zh: "河內", en: "Hanoi", area: "東南亞" },
  { code: "DAD", zh: "峴港", en: "Da Nang", area: "東南亞" },
  { code: "DPS", zh: "峇里島", en: "Bali", area: "東南亞" },
  { code: "JKT", zh: "雅加達", en: "Jakarta", area: "東南亞" },

  { code: "DEL", zh: "德里", en: "Delhi", area: "南亞中東" },
  { code: "BOM", zh: "孟買", en: "Mumbai", area: "南亞中東" },
  { code: "DXB", zh: "杜拜", en: "Dubai", area: "南亞中東" },
  { code: "DOH", zh: "杜哈", en: "Doha", area: "南亞中東" },
  { code: "IST", zh: "伊斯坦堡", en: "Istanbul", area: "南亞中東" },

  { code: "LON", zh: "倫敦", en: "London", area: "歐洲" },
  { code: "PAR", zh: "巴黎", en: "Paris", area: "歐洲" },
  { code: "AMS", zh: "阿姆斯特丹", en: "Amsterdam", area: "歐洲" },
  { code: "FRA", zh: "法蘭克福", en: "Frankfurt", area: "歐洲" },
  { code: "MUC", zh: "慕尼黑", en: "Munich", area: "歐洲" },
  { code: "ZRH", zh: "蘇黎世", en: "Zurich", area: "歐洲" },
  { code: "VIE", zh: "維也納", en: "Vienna", area: "歐洲" },
  { code: "PRG", zh: "布拉格", en: "Prague", area: "歐洲" },
  { code: "ROM", zh: "羅馬", en: "Rome", area: "歐洲" },
  { code: "BCN", zh: "巴塞隆納", en: "Barcelona", area: "歐洲" },
  { code: "MAD", zh: "馬德里", en: "Madrid", area: "歐洲" },

  { code: "NYC", zh: "紐約", en: "New York", area: "美洲" },
  { code: "LAX", zh: "洛杉磯", en: "Los Angeles", area: "美洲" },
  { code: "SFO", zh: "舊金山", en: "San Francisco", area: "美洲" },
  { code: "SEA", zh: "西雅圖", en: "Seattle", area: "美洲" },
  { code: "CHI", zh: "芝加哥", en: "Chicago", area: "美洲" },
  { code: "YVR", zh: "溫哥華", en: "Vancouver", area: "美洲" },
  { code: "YTO", zh: "多倫多", en: "Toronto", area: "美洲" },

  { code: "SYD", zh: "雪梨", en: "Sydney", area: "大洋洲" },
  { code: "MEL", zh: "墨爾本", en: "Melbourne", area: "大洋洲" },
  { code: "AKL", zh: "奧克蘭", en: "Auckland", area: "大洋洲" },
];

const BY_CODE = new Map(CITIES.map((city) => [city.code, city]));

export function cityOf(code: string): City | undefined {
  return BY_CODE.get(code);
}

/** "TPE-LON" -> "台北 ✈ 倫敦"；查不到的代碼就原樣顯示 */
export function splitRoute(route: string): [string, string] {
  const [origin = route, destination = ""] = route.split("-");
  return [origin, destination];
}

export function routeLabel(route: string): string {
  const [origin, destination] = splitRoute(route);
  return `${cityOf(origin)?.zh ?? origin} ✈ ${cityOf(destination)?.zh ?? destination}`;
}

export function routeLabelEn(route: string): string {
  const [origin, destination] = splitRoute(route);
  return `${cityOf(origin)?.en ?? origin} to ${cityOf(destination)?.en ?? destination}`;
}

/** 選單搜尋：中文名、英文名、代碼都能打 */
export function matchCity(city: City, keyword: string): boolean {
  const q = keyword.trim().toLowerCase();
  if (!q) return true;
  return (
    city.code.toLowerCase().includes(q) ||
    city.en.toLowerCase().includes(q) ||
    city.zh.includes(keyword.trim())
  );
}
