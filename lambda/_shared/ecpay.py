"""綠界 CheckMacValue 計算與驗證（純標準庫，不需 SDK 或 layer）。

這份會原封不動複製進每個 ECPay Lambda 的 index.py（Lambda 之間不共用檔案）。
改動這裡之後要重新部署所有 ECPay Lambda。
"""
import hashlib
import urllib.parse


def ecpay_url_encode(s):
    """綠界官方的 ecpayUrlEncode（對應 PHP SDK 的 UrlService::ecpayUrlEncode）。

    重點：quote_plus 不會編碼 ~（它被歸類為 unreserved），必須自己補成 %7E，
    否則任何含 ~ 的值都會算出錯的 MAC。
    """
    e = urllib.parse.quote_plus(str(s)).replace("~", "%7E")
    e = e.lower()  # 先轉小寫，所以 %7E 會變成 %7e
    for old, new in (
        ("%2d", "-"), ("%5f", "_"), ("%2e", "."), ("%21", "!"),
        ("%2a", "*"), ("%28", "("), ("%29", ")"),
    ):
        e = e.replace(old, new)
    return e


def gen_check_mac_value(params, hash_key, hash_iv, method="SHA256"):
    """算 CheckMacValue。

    只丟掉 CheckMacValue 本身，**保留值為空字串的欄位** —— 綠界送 CustomField3=&CustomField4=
    的時候是把它們算進 MAC 的，過濾掉會導致每一次真實 callback 都驗不過。
    """
    items = {k: v for k, v in params.items() if k != "CheckMacValue"}
    body = "&".join("%s=%s" % (k, items[k]) for k in sorted(items, key=str.lower))
    raw = "HashKey=%s&%s&HashIV=%s" % (hash_key, body, hash_iv)
    encoded = ecpay_url_encode(raw).encode()
    digest = hashlib.md5(encoded) if method.upper() == "MD5" else hashlib.sha256(encoded)
    return digest.hexdigest().upper()


def verify_check_mac_value(params, hash_key, hash_iv):
    received = (params.get("CheckMacValue") or "").upper()
    return bool(received) and received == gen_check_mac_value(params, hash_key, hash_iv)
