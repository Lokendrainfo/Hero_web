import os
import sys
import django
import json
from datetime import datetime

sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings.development")
django.setup()

from apps.integrations.ilync_client import IlyncClient

client = IlyncClient()

exec_res = client.get_task_execution("6a9672049e04009ee6590c2a")
data = exec_res.get('data') or exec_res
field_data = data.get('fieldData') if isinstance(data, dict) else {}
trenching = field_data.get('trenching') or {}
pits = trenching.get('pitDetails') or field_data.get('pitDetails') or []
shots = trenching.get('hddShot') or field_data.get('hddShot') or []

def ts_to_date(ts):
    if not ts:
        return "N/A"
    try:
        if isinstance(ts, (int, float)):
            if ts > 1e11: # milliseconds
                ts = ts / 1000.0
            return datetime.fromtimestamp(ts).strftime('%Y-%m-%d %H:%M:%S')
        if isinstance(ts, str):
            return ts
    except Exception as e:
        return str(ts)
    return str(ts)

print("--- PITS TIMESTAMPS ---")
for p in pits[:3]:
    p_name = p.get('pitName') or p.get('pitSerialNo')
    p_time = p.get('pitDiggingTime')
    p_img1 = p.get('pitImage_1') or {}
    img_cap = p_img1.get('capturedAt')
    print(f"Pit {p_name}: diggingTime={p_time}, image_capturedAt={img_cap} ({ts_to_date(img_cap)})")

print("\n--- SHOTS / TRENCHES TIMESTAMPS ---")
for s in shots[:3]:
    s_name = s.get('hddShotName') or s.get('hddShotSerialNo')
    st = s.get('hddStartTime')
    et = s.get('hddEndTime')
    print(f"Shot {s_name}: hddStartTime={st} ({ts_to_date(st)}), hddEndTime={et} ({ts_to_date(et)})")
    dc = s.get('depthCapture') or []
    if dc:
        dc0 = dc[0]
        c_at = dc0.get('capturedAt')
        print(f"  DepthCap 0: capturedAt={c_at} ({ts_to_date(c_at)})")
