import os
import sys
import django
import json

sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings.development")
django.setup()

from apps.integrations.ilync_client import IlyncClient

client = IlyncClient()

keys = [
    'surveys/6a9672049e04009ee6590c2a/pit_1_pit_photo_1-b660c88d-788d-41fd-9496-e67238eb23e3',
    'surveys/6a9672049e04009ee6590c2a/depth_record_1_photo-bfd1c46a-f2b2-4c3b-9298-90a44096b707'
]

test_cases = {
    "1. list of strings": keys,
    "2. dict photoUrls": {"photoUrls": keys},
    "3. dict photoUrl": {"photoUrl": keys},
    "4. dict keys": {"keys": keys},
    "5. dict urls": {"urls": keys},
    "6. dict photoKeys": {"photoKeys": keys},
    "7. dict fileNames": {"fileNames": keys},
    "8. dict imagePaths": {"imagePaths": keys},
    "9. dict list of dicts": [{"photoUrl": k} for k in keys],
    "10. dict photoUrls list of dicts": {"photoUrls": [{"photoUrl": k} for k in keys]},
    "11. taskId + photoUrls": {"taskId": "6a9672049e04009ee6590c2a", "photoUrls": keys},
    "12. taskExecutionId + photoUrls": {"taskExecutionId": "6a9672049e04009ee6590c2a", "photoUrls": keys},
}

for name, payload in test_cases.items():
    try:
        res = client.post("api/survey/photo-urls", json=payload)
        d = res.get('data') if isinstance(res, dict) else None
        print(f"{name} -> Status 200, data type={type(d)}, data content={d}")
    except Exception as e:
        print(f"{name} -> ERROR: {str(e)}")
