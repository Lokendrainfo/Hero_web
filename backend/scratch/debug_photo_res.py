import os
import sys
import django
import json

sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings.development")
django.setup()

from apps.integrations.ilync_client import IlyncClient

client = IlyncClient()

print("--- FETCHING EXECUTION 6a9672049e04009ee6590c26 ---")
exec_26 = client.get_task_execution("6a9672049e04009ee6590c26")
print("Exec 26 keys:", list(exec_26.keys()) if isinstance(exec_26, dict) else type(exec_26))
d26 = exec_26.get('data') or exec_26

print("\n--- FETCHING CHILDREN FOR 6a9672049e04009ee6590c26 ---")
child_res = client.get_task_children("6a9672049e04009ee6590c26")
print("Children response:", child_res)

print("\n--- FETCHING EXECUTION 6a9672049e04009ee6590c2a ---")
exec_2a = client.get_task_execution("6a9672049e04009ee6590c2a")
d2a = exec_2a.get('data') or exec_2a
field_data = d2a.get('fieldData') if isinstance(d2a, dict) else {}
trenching = field_data.get('trenching') or {}
pits = trenching.get('pitDetails') or field_data.get('pitDetails') or []

keys_to_test = []
for p in pits:
    for k in ['pitImage_1', 'pitImage_2', 'pitImage_3', 'pitDepthImage', 'pitVideo']:
        val = p.get(k)
        if isinstance(val, dict) and val.get('photoUrl'):
            keys_to_test.append(val.get('photoUrl'))
        elif isinstance(val, str) and val:
            keys_to_test.append(val)

print(f"Total keys collected from 6a9672049e04009ee6590c2a pits: {len(keys_to_test)}")
print("First 3 keys:", keys_to_test[:3])

res = client.get_survey_photo_urls(keys_to_test)
print("\n--- POST api/survey/photo-urls RESPONSE ---")
print("Keys in returned data dict:", len(res.get('data', {})))
for k, v in list(res.get('data', {}).items())[:2]:
    print(f"KEY: {k}\n  -> PRESIGNED URL: {v[:120]}...\n")
