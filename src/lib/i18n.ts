/**
 * 極簡 i18n —— 不引外部套件，一個字典 + 一個 context 就夠這個規模的站。
 *
 * 語系決定順序：使用者選過的 > 瀏覽器語言 > 繁中。
 * 使用者選的語系會在訂閱時一起送給後端，通知信就用同一個語言寄。
 */
import {
  createContext,
  createElement,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

export const LOCALES = ["zh-Hant", "zh-Hans", "en", "ja"] as const;
export type Locale = (typeof LOCALES)[number];

export const LOCALE_NAMES: Record<Locale, string> = {
  "zh-Hant": "繁體中文",
  "zh-Hans": "简体中文",
  en: "English",
  ja: "日本語",
};

const STORAGE_KEY = "locale";

/** 瀏覽器語言 -> 我們支援的語系 */
export function detectLocale(): Locale {
  if (typeof navigator === "undefined") return "zh-Hant";
  for (const raw of navigator.languages ?? [navigator.language]) {
    const tag = raw.toLowerCase();
    if (tag.startsWith("ja")) return "ja";
    if (tag.startsWith("en")) return "en";
    if (tag.startsWith("zh")) {
      // zh-TW / zh-HK / zh-Hant 走繁體，其餘（zh-CN / zh-SG）走簡體
      return /hant|tw|hk|mo/.test(tag) ? "zh-Hant" : "zh-Hans";
    }
  }
  return "zh-Hant";
}

export function storedLocale(): Locale | null {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    return LOCALES.includes(saved as Locale) ? (saved as Locale) : null;
  } catch {
    return null;
  }
}

type Dict = Record<string, string>;

const zhHant: Dict = {
  "app.name": "Flight Price Notifier",
  "app.tagline": "機票降價通知",
  "nav.signIn": "登入",
  "nav.signOut": "登出",
  "theme.toLight": "切換到淺色",
  "theme.toDark": "切換到深色",
  "lang.label": "語言",

  "dash.eyebrow": "Your fare watch",
  "dash.title": "你的降價通知",
  "dash.signedInAs": "已登入",
  "dash.myRoutes": "我的航線",
  "dash.loading": "讀取中",
  "dash.addRoute": "新增航線",
  "dash.empty": "還沒有追蹤中的航線。",
  "dash.addFirst": "新增第一條航線",
  "dash.noApi": "尚未設定 VITE_FLIGHT_API_URL，訂閱功能停用。",
  "dash.loadError": "讀不到現有訂閱，稍後再試。",

  "banner.close": "關閉這則訊息",
  "banner.activating": "{route} 付款完成，正在啟用…",
  "banner.activated": "{route} 訂閱已啟用，我們開始為你盯票價了。",
  "banner.unconfirmed": "{route} 付款完成，但還沒收到綠界的確認。稍後重新整理看看。",
  "banner.failed": "{route} 付款沒有完成，還沒開始通知你。可以再按一次「完成付款」。",

  "badge.active": "通知中",
  "badge.draft": "未訂閱",
  "badge.pending": "未完成付款",
  "badge.cancelled": "已取消訂閱",
  "badge.expired": "已停止",

  "cta.subscribe": "訂閱並付款",
  "cta.completePayment": "完成付款",
  "cta.resubscribe": "重新訂閱",

  "note.draft": "每月 {price}，訂閱後才會開始為你盯這條航線",
  "note.pending": "付款完成後才會開始為你盯票價",
  "note.active": "本期至 {date}，到期自動續訂",
  "note.cancelled": "不會再扣款，{date} 前仍然會通知你，之後可以重新訂閱",
  "note.cancelledNoDate": "不會再扣款，本期結束前仍然會通知你，之後可以重新訂閱",
  "note.expired": "月費 {price}，隨時可取消",

  "card.targetPrice": "目標價（TWD）",
  "card.currentPrice": "目前最低約 {price}（下個月，參考值）",
  "card.priceLoading": "目前票價查詢中…",
  "card.update": "更新目標價",
  "card.revert": "還原",
  "card.cancel": "取消訂閱",
  "card.remove": "移除",
  "card.confirmCancel": "確定取消訂閱？",
  "card.confirmRemove": "移除後會停止通知，30 天內可以從「最近移除」原樣復原。確定？",
  "card.confirmYes": "確定",
  "card.rethink": "再想想",
  "card.payConfirm": "將前往綠界結帳，每月 {price}。",
  "card.goPay": "前往付款",
  "card.saveError": "儲存失敗，稍後再試。",
  "card.cancelError": "取消失敗，稍後再試。",
  "card.removeError": "移除失敗，稍後再試。",

  "removed.title": "最近移除（{count}）",
  "removed.hint": "移除的航線會保留 30 天，這段期間可以原樣復原 —— 目標價與剩下的訂閱天數都會回來。",
  "removed.target": "目標 {price}",
  "removed.restore": "復原",
  "removed.purge": "永久刪除",
  "removed.error": "操作失敗，稍後再試。",

  "dialog.title": "新增航線",
  "dialog.subtitle": "先加進清單，要不要付費訂閱在卡片上決定",
  "dialog.from": "從哪裡出發",
  "dialog.to": "要去哪裡",
  "dialog.swap": "對調出發地與目的地",
  "dialog.close": "關閉",
  "dialog.cancel": "取消",
  "dialog.targetLabel": "目標價（TWD）—— 低於這個價格就通知你",
  "dialog.priceLoading": "查詢目前票價…",
  "dialog.priceHint": "{route} 下個月最低約 {price}。目標價設高於這個數字，就會馬上收到通知。",
  "dialog.usePrice": "帶入這個價格",
  "dialog.noPrice": "查不到這條航線目前的票價，可能是冷門航線或暫時沒有報價。",
  "dialog.pickDest": "選一個目的地",
  "dialog.add": "加入追蹤 {route}",
  "dialog.already": "{route} 已經在你的清單裡，送出會直接更新它的目標價。",

  "picker.select": "選擇城市",
  "picker.hint": "中文、英文或代碼都能搜",
  "picker.custom": "自訂代碼",
  "picker.search": "搜尋城市，或直接打 IATA 三碼",
  "picker.useCode": "使用代碼 {code}",
  "picker.customTag": "自訂",
  "picker.notFound": "找不到「{keyword}」。知道代碼的話直接打三碼，例如 LON。",

  "area.tw": "台灣",
  "area.jp": "日本",
  "area.kr": "韓國",
  "area.cn": "港澳中國",
  "area.sea": "東南亞",
  "area.me": "南亞中東",
  "area.eu": "歐洲",
  "area.am": "美洲",
  "area.oc": "大洋洲",

  "info.title": "通知怎麼送到你手上",
  "info.body1": "我們每 30 分鐘查一次下個月的最低票價。低於你的目標價就寄 email 給你，附上立即訂購連結。同一條航線 24 小時內只寄一次，除非價格又跌超過 20%（或 NT$2,000）。",
  "info.body2": "每條航線月費 {price}，由綠界信用卡定期定額扣款。隨時可以取消，取消後不再扣款，但本期結束前仍然會通知你。",

  "home.heroBadge": "自己挑航線 · 全球主要城市",
  "home.heroTitle": "設定航線與目標價，機票降價就通知你",
  "home.f1.title": "盯緊你要的航線",
  "home.f1.body": "自己挑出發地與目的地，我們持續監控最低票價。",
  "home.f2.title": "達標自動通知",
  "home.f2.body": "低於你設定的目標價，就寄 email 提醒你，附上立即訂購連結。",
  "home.f3.title": "隨時取消",
  "home.f3.body": "月訂閱制，不想用隨時停，沒有綁約。",
  "home.stepsTitle": "三步就好",
  "home.s1.title": "登入帳號",
  "home.s1.body": "用 email 登入，開始建立你的航線清單。",
  "home.s2.title": "設定航線與目標價",
  "home.s2.body": "挑一組出發地與目的地，填上你願意出手的價格。",
  "home.s3.title": "等信就好",
  "home.s3.body": "票價落到目標價以下，通知信會帶著訂購連結寄給你。",
  "home.midTitle": "替你守著票價，直到它便宜為止",
  "home.midBody": "不用每天打開比價網站重刷一次，把航線交給我們就好。",
  "home.ctaTitle": "下一趟旅程，等它降價再出發",
  "auth.signinTitle": "歡迎回來",
  "auth.signupTitle": "建立帳號",
  "auth.signinSub": "登入後管理你的票價提醒",
  "auth.signupSub": "建立帳號，開始追蹤票價",
  "auth.pwHint": "至少 6 個字元",
  "auth.signinCta": "登入",
  "auth.signupCta": "建立帳號",
  "auth.privacy": "你的信箱只用來寄票價提醒"
};

const zhHans: Dict = {
  ...zhHant,
  "app.tagline": "机票降价通知",
  "nav.signIn": "登录",
  "nav.signOut": "登出",
  "theme.toLight": "切换到浅色",
  "theme.toDark": "切换到深色",
  "lang.label": "语言",
  "dash.title": "你的降价通知",
  "dash.signedInAs": "已登录",
  "dash.myRoutes": "我的航线",
  "dash.loading": "读取中",
  "dash.addRoute": "新增航线",
  "dash.empty": "还没有追踪中的航线。",
  "dash.addFirst": "新增第一条航线",
  "dash.noApi": "尚未设置 VITE_FLIGHT_API_URL，订阅功能停用。",
  "dash.loadError": "读不到现有订阅，稍后再试。",
  "banner.close": "关闭这则消息",
  "banner.activating": "{route} 付款完成，正在启用…",
  "banner.activated": "{route} 订阅已启用，我们开始为你盯票价了。",
  "banner.unconfirmed": "{route} 付款完成，但还没收到绿界的确认。稍后刷新看看。",
  "banner.failed": "{route} 付款没有完成，还没开始通知你。可以再按一次「完成付款」。",
  "badge.active": "通知中",
  "badge.draft": "未订阅",
  "badge.pending": "未完成付款",
  "badge.cancelled": "已取消订阅",
  "badge.expired": "已停止",
  "cta.subscribe": "订阅并付款",
  "cta.completePayment": "完成付款",
  "cta.resubscribe": "重新订阅",
  "note.draft": "每月 {price}，订阅后才会开始为你盯这条航线",
  "note.pending": "付款完成后才会开始为你盯票价",
  "note.active": "本期至 {date}，到期自动续订",
  "note.cancelled": "不会再扣款，{date} 前仍然会通知你，之后可以重新订阅",
  "note.cancelledNoDate": "不会再扣款，本期结束前仍然会通知你，之后可以重新订阅",
  "note.expired": "月费 {price}，随时可取消",
  "card.targetPrice": "目标价（TWD）",
  "card.currentPrice": "目前最低约 {price}（下个月，参考值）",
  "card.priceLoading": "目前票价查询中…",
  "card.update": "更新目标价",
  "card.revert": "还原",
  "card.cancel": "取消订阅",
  "card.remove": "移除",
  "card.confirmCancel": "确定取消订阅？",
  "card.confirmRemove": "移除后会停止通知，30 天内可以从「最近移除」原样恢复。确定？",
  "card.confirmYes": "确定",
  "card.rethink": "再想想",
  "card.payConfirm": "将前往绿界结账，每月 {price}。",
  "card.goPay": "前往付款",
  "card.saveError": "保存失败，稍后再试。",
  "card.cancelError": "取消失败，稍后再试。",
  "card.removeError": "移除失败，稍后再试。",
  "removed.title": "最近移除（{count}）",
  "removed.hint": "移除的航线会保留 30 天，这段期间可以原样恢复 —— 目标价与剩下的订阅天数都会回来。",
  "removed.target": "目标 {price}",
  "removed.restore": "恢复",
  "removed.purge": "永久删除",
  "removed.error": "操作失败，稍后再试。",
  "dialog.title": "新增航线",
  "dialog.subtitle": "先加进清单，要不要付费订阅在卡片上决定",
  "dialog.from": "从哪里出发",
  "dialog.to": "要去哪里",
  "dialog.swap": "对调出发地与目的地",
  "dialog.close": "关闭",
  "dialog.cancel": "取消",
  "dialog.targetLabel": "目标价（TWD）—— 低于这个价格就通知你",
  "dialog.priceLoading": "查询目前票价…",
  "dialog.priceHint": "{route} 下个月最低约 {price}。目标价设高于这个数字，就会马上收到通知。",
  "dialog.usePrice": "带入这个价格",
  "dialog.noPrice": "查不到这条航线目前的票价，可能是冷门航线或暂时没有报价。",
  "dialog.pickDest": "选一个目的地",
  "dialog.add": "加入追踪 {route}",
  "dialog.already": "{route} 已经在你的清单里，提交会直接更新它的目标价。",
  "picker.select": "选择城市",
  "picker.hint": "中文、英文或代码都能搜",
  "picker.custom": "自定代码",
  "picker.search": "搜索城市，或直接打 IATA 三码",
  "picker.useCode": "使用代码 {code}",
  "picker.customTag": "自定",
  "picker.notFound": "找不到「{keyword}」。知道代码的话直接打三码，例如 LON。",
  "area.cn": "港澳中国",
  "area.kr": "韩国",
  "area.sea": "东南亚",
  "area.me": "南亚中东",
  "area.eu": "欧洲",
  "area.am": "美洲",
  "area.oc": "大洋洲",
  "info.title": "通知怎么送到你手上",
  "info.body1": "我们每 30 分钟查一次下个月的最低票价。低于你的目标价就寄 email 给你，附上立即订购链接。同一条航线 24 小时内只寄一次，除非价格又跌超过 20%（或 NT$2,000）。",
  "info.body2": "每条航线月费 {price}，由绿界信用卡定期定额扣款。随时可以取消，取消后不再扣款，但本期结束前仍然会通知你。",
  "home.heroBadge": "自己挑航线 · 全球主要城市",
  "home.heroTitle": "设定航线与目标价，机票降价就通知你",
  "home.f1.title": "盯紧你要的航线",
  "home.f1.body": "自己挑出发地与目的地，我们持续监控最低票价。",
  "home.f2.title": "达标自动通知",
  "home.f2.body": "低于你设定的目标价，就寄 email 提醒你，附上立即订购链接。",
  "home.f3.title": "随时取消",
  "home.f3.body": "月订阅制，不想用随时停，没有绑约。",
  "home.stepsTitle": "三步就好",
  "home.s1.title": "登录账号",
  "home.s1.body": "用 email 登录，开始建立你的航线清单。",
  "home.s2.title": "设定航线与目标价",
  "home.s2.body": "挑一组出发地与目的地，填上你愿意出手的价格。",
  "home.s3.title": "等信就好",
  "home.s3.body": "票价落到目标价以下，通知信会带着订购链接寄给你。",
  "home.midTitle": "替你守着票价，直到它便宜为止",
  "home.midBody": "不用每天打开比价网站重刷一次，把航线交给我们就好。",
  "home.ctaTitle": "下一趟旅程，等它降价再出发",
  "auth.signinTitle": "欢迎回来",
  "auth.signupTitle": "创建账号",
  "auth.signinSub": "登录后管理你的票价提醒",
  "auth.signupSub": "创建账号，开始追踪票价",
  "auth.pwHint": "至少 6 个字符",
  "auth.signinCta": "登录",
  "auth.signupCta": "创建账号",
  "auth.privacy": "你的邮箱只用来寄票价提醒"
};

const en: Dict = {
  "app.name": "Flight Price Notifier",
  "app.tagline": "Fare drop alerts",
  "nav.signIn": "Sign in",
  "nav.signOut": "Sign out",
  "theme.toLight": "Switch to light",
  "theme.toDark": "Switch to dark",
  "lang.label": "Language",

  "dash.eyebrow": "Your fare watch",
  "dash.title": "Your fare alerts",
  "dash.signedInAs": "Signed in as",
  "dash.myRoutes": "My routes",
  "dash.loading": "Loading",
  "dash.addRoute": "Add route",
  "dash.empty": "You're not watching any routes yet.",
  "dash.addFirst": "Add your first route",
  "dash.noApi": "VITE_FLIGHT_API_URL is not set — subscriptions are disabled.",
  "dash.loadError": "Couldn't load your subscriptions. Try again shortly.",

  "banner.close": "Dismiss",
  "banner.activating": "Payment received for {route}. Activating…",
  "banner.activated": "{route} is active — we're watching the fare for you.",
  "banner.unconfirmed": "Payment received for {route}, but ECPay hasn't confirmed yet. Refresh in a moment.",
  "banner.failed": "Payment for {route} didn't go through, so alerts haven't started. You can try “Complete payment” again.",

  "badge.active": "Watching",
  "badge.draft": "Not subscribed",
  "badge.pending": "Payment incomplete",
  "badge.cancelled": "Cancelled",
  "badge.expired": "Stopped",

  "cta.subscribe": "Subscribe & pay",
  "cta.completePayment": "Complete payment",
  "cta.resubscribe": "Subscribe again",

  "note.draft": "{price}/month — alerts start once you subscribe",
  "note.pending": "Alerts start once the payment completes",
  "note.active": "Current period ends {date}, renews automatically",
  "note.cancelled": "No further charges. You'll still be alerted until {date}, then you can subscribe again.",
  "note.cancelledNoDate": "No further charges. You'll still be alerted until the period ends, then you can subscribe again.",
  "note.expired": "{price}/month, cancel anytime",

  "card.targetPrice": "Target price (TWD)",
  "card.currentPrice": "Currently around {price} (next month, for reference)",
  "card.priceLoading": "Checking the current fare…",
  "card.update": "Update target",
  "card.revert": "Revert",
  "card.cancel": "Cancel subscription",
  "card.remove": "Remove",
  "card.confirmCancel": "Cancel this subscription?",
  "card.confirmRemove": "Alerts stop right away. You can restore it exactly as it was from “Recently removed” for 30 days. Continue?",
  "card.confirmYes": "Confirm",
  "card.rethink": "Never mind",
  "card.payConfirm": "You'll be taken to ECPay. {price} per month.",
  "card.goPay": "Go to payment",
  "card.saveError": "Couldn't save. Try again shortly.",
  "card.cancelError": "Couldn't cancel. Try again shortly.",
  "card.removeError": "Couldn't remove. Try again shortly.",

  "removed.title": "Recently removed ({count})",
  "removed.hint": "Removed routes are kept for 30 days. Restoring brings back the target price and any remaining subscription days.",
  "removed.target": "Target {price}",
  "removed.restore": "Restore",
  "removed.purge": "Delete permanently",
  "removed.error": "That didn't work. Try again shortly.",

  "dialog.title": "Add a route",
  "dialog.subtitle": "Add it to your list first — you decide whether to subscribe on the card",
  "dialog.from": "Flying from",
  "dialog.to": "Flying to",
  "dialog.swap": "Swap origin and destination",
  "dialog.close": "Close",
  "dialog.cancel": "Cancel",
  "dialog.targetLabel": "Target price (TWD) — we'll alert you below this",
  "dialog.priceLoading": "Checking the current fare…",
  "dialog.priceHint": "{route} is around {price} next month. Set your target above that to be alerted right away.",
  "dialog.usePrice": "Use this price",
  "dialog.noPrice": "No fare found for this route — it may be uncommon or temporarily unpriced.",
  "dialog.pickDest": "Pick a destination",
  "dialog.add": "Watch {route}",
  "dialog.already": "{route} is already on your list — submitting will just update its target price.",

  "picker.select": "Select a city",
  "picker.hint": "Search by name or IATA code",
  "picker.custom": "Custom code",
  "picker.search": "Search cities, or type an IATA code",
  "picker.useCode": "Use code {code}",
  "picker.customTag": "Custom",
  "picker.notFound": "No match for “{keyword}”. If you know the code, type the three letters — for example LON.",

  "area.tw": "Taiwan",
  "area.jp": "Japan",
  "area.kr": "Korea",
  "area.cn": "Greater China",
  "area.sea": "Southeast Asia",
  "area.me": "South Asia & Middle East",
  "area.eu": "Europe",
  "area.am": "Americas",
  "area.oc": "Oceania",

  "info.title": "How alerts reach you",
  "info.body1": "We check next month's lowest fare every 30 minutes. When it drops below your target we email you with a booking link. At most one email per route per 24 hours, unless the fare drops another 20% (or NT$2,000).",
  "info.body2": "{price} per route per month, billed by ECPay recurring credit card. Cancel anytime — billing stops immediately and alerts continue until the period ends.",

  "home.heroBadge": "Pick any route · major cities worldwide",
  "home.heroTitle": "Set a route and a target price. We'll tell you when it drops.",
  "home.f1.title": "Watch the route you want",
  "home.f1.body": "Choose your own origin and destination — we keep checking the lowest fare.",
  "home.f2.title": "Alerts when it hits",
  "home.f2.body": "Drop below your target and we email you, booking link included.",
  "home.f3.title": "Cancel anytime",
  "home.f3.body": "Monthly subscription, no contract, stop whenever you like.",
  "home.stepsTitle": "Three steps",
  "home.s1.title": "Sign in",
  "home.s1.body": "Sign in with your email and start building your route list.",
  "home.s2.title": "Set route and target",
  "home.s2.body": "Pick an origin and destination, then name the price you'd book at.",
  "home.s3.title": "Wait for the email",
  "home.s3.body": "When the fare falls below your target, the alert arrives with a booking link.",
  "home.midTitle": "We'll watch the fare until it's cheap",
  "home.midBody": "No more refreshing comparison sites every day — hand the route to us.",
  "home.ctaTitle": "Wait for the drop, then go",
  "auth.signinTitle": "Welcome back",
  "auth.signupTitle": "Create account",
  "auth.signinSub": "Sign in to manage your fare alerts",
  "auth.signupSub": "Create an account to start tracking fares",
  "auth.pwHint": "At least 6 characters",
  "auth.signinCta": "Sign in",
  "auth.signupCta": "Create account",
  "auth.privacy": "Your email is only used for fare alerts"
};

const ja: Dict = {
  "app.name": "Flight Price Notifier",
  "app.tagline": "航空券の値下げ通知",
  "nav.signIn": "ログイン",
  "nav.signOut": "ログアウト",
  "theme.toLight": "ライトモードへ",
  "theme.toDark": "ダークモードへ",
  "lang.label": "言語",

  "dash.eyebrow": "Your fare watch",
  "dash.title": "値下げ通知",
  "dash.signedInAs": "ログイン中",
  "dash.myRoutes": "マイ路線",
  "dash.loading": "読み込み中",
  "dash.addRoute": "路線を追加",
  "dash.empty": "まだ追跡中の路線がありません。",
  "dash.addFirst": "最初の路線を追加",
  "dash.noApi": "VITE_FLIGHT_API_URL が未設定のため、購読機能は無効です。",
  "dash.loadError": "購読情報を読み込めませんでした。しばらくしてからお試しください。",

  "banner.close": "閉じる",
  "banner.activating": "{route} の決済が完了しました。有効化しています…",
  "banner.activated": "{route} の購読が有効になりました。運賃の監視を開始します。",
  "banner.unconfirmed": "{route} の決済は完了しましたが、ECPay からの確認がまだ届いていません。少し待って再読み込みしてください。",
  "banner.failed": "{route} の決済が完了しなかったため、通知はまだ開始されていません。「決済を完了する」をもう一度お試しください。",

  "badge.active": "監視中",
  "badge.draft": "未購読",
  "badge.pending": "決済未完了",
  "badge.cancelled": "購読解約済み",
  "badge.expired": "停止中",

  "cta.subscribe": "購読して決済",
  "cta.completePayment": "決済を完了する",
  "cta.resubscribe": "再購読する",

  "note.draft": "月額 {price}。購読するとこの路線の監視を開始します",
  "note.pending": "決済完了後に運賃の監視を開始します",
  "note.active": "今期は {date} まで。期限が来ると自動更新されます",
  "note.cancelled": "以降の請求はありません。{date} までは通知が届き、その後に再購読できます",
  "note.cancelledNoDate": "以降の請求はありません。今期が終わるまでは通知が届き、その後に再購読できます",
  "note.expired": "月額 {price}、いつでも解約できます",

  "card.targetPrice": "目標価格（TWD）",
  "card.currentPrice": "現在およそ {price}（来月・参考値）",
  "card.priceLoading": "現在の運賃を確認中…",
  "card.update": "目標価格を更新",
  "card.revert": "元に戻す",
  "card.cancel": "購読を解約",
  "card.remove": "削除",
  "card.confirmCancel": "この購読を解約しますか？",
  "card.confirmRemove": "通知はすぐに停止します。30 日以内なら「最近削除した路線」からそのまま復元できます。続けますか？",
  "card.confirmYes": "確定",
  "card.rethink": "やめる",
  "card.payConfirm": "ECPay の決済ページへ移動します。月額 {price}。",
  "card.goPay": "決済へ進む",
  "card.saveError": "保存できませんでした。しばらくしてからお試しください。",
  "card.cancelError": "解約できませんでした。しばらくしてからお試しください。",
  "card.removeError": "削除できませんでした。しばらくしてからお試しください。",

  "removed.title": "最近削除した路線（{count}）",
  "removed.hint": "削除した路線は 30 日間保持されます。復元すると目標価格と残りの購読日数もそのまま戻ります。",
  "removed.target": "目標 {price}",
  "removed.restore": "復元",
  "removed.purge": "完全に削除",
  "removed.error": "処理できませんでした。しばらくしてからお試しください。",

  "dialog.title": "路線を追加",
  "dialog.subtitle": "まずはリストに追加。購読するかどうかはカードで決められます",
  "dialog.from": "出発地",
  "dialog.to": "目的地",
  "dialog.swap": "出発地と目的地を入れ替える",
  "dialog.close": "閉じる",
  "dialog.cancel": "キャンセル",
  "dialog.targetLabel": "目標価格（TWD）—— これを下回ったら通知します",
  "dialog.priceLoading": "現在の運賃を確認中…",
  "dialog.priceHint": "{route} の来月の最安はおよそ {price} です。これより高めに設定するとすぐ通知が届きます。",
  "dialog.usePrice": "この価格を使う",
  "dialog.noPrice": "この路線の運賃が見つかりませんでした。マイナー路線か、一時的に価格が出ていない可能性があります。",
  "dialog.pickDest": "目的地を選択",
  "dialog.add": "{route} を追跡",
  "dialog.already": "{route} はすでにリストにあります。送信すると目標価格だけが更新されます。",

  "picker.select": "都市を選択",
  "picker.hint": "都市名でも IATA コードでも検索できます",
  "picker.custom": "カスタムコード",
  "picker.search": "都市を検索、または IATA コードを入力",
  "picker.useCode": "コード {code} を使う",
  "picker.customTag": "カスタム",
  "picker.notFound": "「{keyword}」が見つかりません。コードが分かる場合は 3 文字で入力してください（例：LON）。",

  "area.tw": "台湾",
  "area.jp": "日本",
  "area.kr": "韓国",
  "area.cn": "中華圏",
  "area.sea": "東南アジア",
  "area.me": "南アジア・中東",
  "area.eu": "ヨーロッパ",
  "area.am": "南北アメリカ",
  "area.oc": "オセアニア",

  "info.title": "通知が届くしくみ",
  "info.body1": "30 分ごとに来月の最安運賃を確認します。目標価格を下回ったら、予約リンク付きのメールをお送りします。同じ路線は 24 時間に 1 通まで（さらに 20%、または NT$2,000 下がった場合は除く）。",
  "info.body2": "1 路線あたり月額 {price}、ECPay のクレジットカード定期課金です。いつでも解約でき、解約後は請求されませんが今期が終わるまで通知は続きます。",

  "home.heroBadge": "路線は自由に選択 · 世界の主要都市",
  "home.heroTitle": "路線と目標価格を設定。値下がりしたらお知らせします。",
  "home.f1.title": "好きな路線を監視",
  "home.f1.body": "出発地と目的地を自分で選ぶと、最安運賃を継続的に確認します。",
  "home.f2.title": "目標到達で自動通知",
  "home.f2.body": "目標価格を下回ったら、予約リンク付きでメールをお送りします。",
  "home.f3.title": "いつでも解約",
  "home.f3.body": "月額制。契約の縛りはなく、好きなときに止められます。",
  "home.stepsTitle": "3 ステップ",
  "home.s1.title": "ログイン",
  "home.s1.body": "メールでログインして、路線リストを作り始めましょう。",
  "home.s2.title": "路線と目標価格を設定",
  "home.s2.body": "出発地と目的地を選び、予約してもよい価格を入力します。",
  "home.s3.title": "メールを待つだけ",
  "home.s3.body": "運賃が目標価格を下回ると、予約リンク付きの通知が届きます。",
  "home.midTitle": "安くなるまで、運賃を見張ります",
  "home.midBody": "比較サイトを毎日開き直す必要はありません。路線はこちらにお任せください。",
  "home.ctaTitle": "値下がりを待ってから、次の旅へ",
  "auth.signinTitle": "おかえりなさい",
  "auth.signupTitle": "アカウント作成",
  "auth.signinSub": "ログインして運賃通知を管理しましょう",
  "auth.signupSub": "アカウントを作成して運賃の追跡を始めましょう",
  "auth.pwHint": "6 文字以上",
  "auth.signinCta": "ログイン",
  "auth.signupCta": "アカウントを作成",
  "auth.privacy": "メールアドレスは運賃通知の送信にのみ使用します"
};

const DICTS: Record<Locale, Dict> = {
  "zh-Hant": zhHant,
  "zh-Hans": zhHans,
  en,
  ja,
};

export type Translate = (key: string, vars?: Record<string, string | number>) => string;

const LocaleContext = createContext<{ locale: Locale; setLocale: (next: Locale) => void }>({
  locale: "zh-Hant",
  setLocale: () => {},
});

export function LocaleProvider({ children }: { children: ReactNode }) {
  // SSR 與第一次繪製都先用繁中，掛載後才換成使用者的語系，避免兩邊對不起來
  const [locale, setLocaleState] = useState<Locale>("zh-Hant");

  useEffect(() => {
    setLocaleState(storedLocale() ?? detectLocale());
  }, []);

  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  const setLocale = useCallback((next: Locale) => {
    setLocaleState(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // 無痕模式寫不進去，這輪切換仍然有效
    }
  }, []);

  const value = useMemo(() => ({ locale, setLocale }), [locale, setLocale]);
  return createElement(LocaleContext.Provider, { value }, children);
}

export function useLocale() {
  return useContext(LocaleContext);
}

export function useT(): { t: Translate; locale: Locale; setLocale: (next: Locale) => void } {
  const { locale, setLocale } = useLocale();
  const t = useCallback<Translate>(
    (key, vars) => {
      const template = DICTS[locale][key] ?? DICTS.en[key] ?? key;
      if (!vars) return template;
      return template.replace(/\{(\w+)\}/g, (match, name: string) =>
        name in vars ? String(vars[name]) : match,
      );
    },
    [locale],
  );
  return { t, locale, setLocale };
}
