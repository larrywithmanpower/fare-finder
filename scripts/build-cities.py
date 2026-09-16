#!/usr/bin/env python3
"""把 src/lib/cities.ts 的城市表轉成 lambda/cities.json

前後端共用同一份翻譯, 後端寄信時直接讀打包進去的這份, 不會跟前端對不起來。
改完城市清單記得重跑這支, 然後重新部署 Lambda。
"""
import json
import pathlib
import re

ROOT = pathlib.Path(__file__).resolve().parent.parent
SRC = ROOT / "src/lib/cities.ts"
OUT = ROOT / "lambda/cities.json"

LINE = re.compile(
    r'\{\s*code:\s*"(\w+)",\s*area:\s*"(\w+)",\s*name:\s*\{\s*'
    r'"zh-Hant":\s*"([^"]+)",\s*"zh-Hans":\s*"([^"]+)",\s*'
    r'en:\s*"([^"]+)",\s*ja:\s*"([^"]+)"\s*\}\s*\}'
)

cities = {}
for code, _area, hant, hans, en, ja in LINE.findall(SRC.read_text()):
    cities[code] = {"zh-Hant": hant, "zh-Hans": hans, "en": en, "ja": ja}

OUT.write_text(json.dumps(cities, ensure_ascii=False, separators=(",", ":")))
print("%s <- %d 個城市" % (OUT.relative_to(ROOT), len(cities)))
