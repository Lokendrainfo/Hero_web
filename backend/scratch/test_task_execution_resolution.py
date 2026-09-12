import requests
import os
import dotenv

dotenv.load_dotenv('e:/Hero_HDD/hero_web/backend/.env')

token = os.environ.get('ILYNC_API_TOKEN')
headers = {'Authorization': f'Bearer {token}', 'Accept': 'application/json'}
base_url = 'https://ilync.tech/api'

r = requests.get(f"{base_url}/tasks/6a9672049e04009ee6590c2a", headers=headers, timeout=10)
data = r.json().get('data', {})
te = data.get('taskExecution', {})
fd = te.get('fieldData', {})
tr = fd.get('trenching', {})
shots = tr.get('hddShot', [])

photo_keys = []
for s in shots:
    if s.get('startHddShotImage'):
        img = s['startHddShotImage']
        k = img.get('photoUrl') or img.get('url') or img if isinstance(img, str) else None
        if k: photo_keys.append(k)
    for dp in s.get('depthCapture', []):
        img = dp.get('depthoMeterImage')
        k = img.get('photoUrl') or img.get('url') if isinstance(img, dict) else (img if isinstance(img, str) else None)
        if k: photo_keys.append(k)

print(f"Extracted {len(photo_keys)} photo keys. First 3:", photo_keys[:3])

r_urls = requests.post(f"{base_url}/survey/photo-urls", json={"photoKeys": photo_keys[:5]}, headers=headers, timeout=10)
print("Photo URLs resolution status:", r_urls.status_code)
if r_urls.status_code == 200:
    print("Resolved URLs sample:", list(r_urls.json().get('data', {}).items())[:2])
