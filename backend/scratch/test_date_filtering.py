import os
import sys
import django
import json
from datetime import datetime
import re

sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings.development")
django.setup()

from apps.integrations.ilync_client import IlyncClient

client = IlyncClient()

def parse_date_to_ymd(date_val):
    if not date_val:
        return None
    if isinstance(date_val, (int, float)):
        try:
            ts = float(date_val)
            if ts > 1e11:
                ts = ts / 1000.0
            return datetime.fromtimestamp(ts).strftime('%Y-%m-%d')
        except Exception:
            return None
    if isinstance(date_val, str):
        s = date_val.strip()
        m_dd = re.match(r'^(\d{2})[-/](\d{2})[-/](\d{4})', s)
        if m_dd:
            dd, mm, yyyy = m_dd.groups()
            return f"{yyyy}-{mm}-{dd}"
        m_yy = re.match(r'^(\d{4})[-/](\d{2})[-/](\d{2})', s)
        if m_yy:
            yyyy, mm, dd = m_yy.groups()
            return f"{yyyy}-{mm}-{dd}"
    return None

exec_res = client.get_task_execution("6a9672049e04009ee6590c2a")
data = exec_res.get('data') or exec_res
field_data = data.get('fieldData') if isinstance(data, dict) else {}
trenching = field_data.get('trenching') or {}
pits = trenching.get('pitDetails') or field_data.get('pitDetails') or []
shots = trenching.get('hddShot') or field_data.get('hddShot') or []

all_dates = set()

for p in pits:
    d = parse_date_to_ymd(p.get('pitDiggingTime')) or parse_date_to_ymd((p.get('pitImage_1') or {}).get('capturedAt'))
    if d: all_dates.add(d)

for s in shots:
    d = parse_date_to_ymd(s.get('hddEndTime')) or parse_date_to_ymd(s.get('hddStartTime'))
    if d: all_dates.add(d)
    for dc in (s.get('depthCapture') or []):
        d_dc = parse_date_to_ymd(dc.get('capturedAt')) or parse_date_to_ymd((dc.get('depthoMeterImage') or {}).get('capturedAt'))
        if d_dc: all_dates.add(d_dc)

print("Unique dates found in task 6a9672049e04009ee6590c2a:", sorted(list(all_dates)))

for target_date in sorted(list(all_dates)):
    matched_shots = []
    for s in shots:
        s_date = parse_date_to_ymd(s.get('hddEndTime')) or parse_date_to_ymd(s.get('hddStartTime'))
        if s_date == target_date:
            matched_shots.append(s.get('hddShotSerialNo') or s.get('hddShotName'))
    print(f"Date {target_date}: {len(matched_shots)} Trenches -> {matched_shots}")
