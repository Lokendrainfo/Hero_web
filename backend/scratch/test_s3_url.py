import os
import sys
import django
import requests

sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings.development")
django.setup()

from apps.integrations.ilync_client import IlyncClient

client = IlyncClient()

key = 'surveys/6a9672049e04009ee6590c2a/pit_1_pit_photo_1-b660c88d-788d-41fd-9496-e67238eb23e3'

res = client.get_survey_photo_urls([key])
print("API Response:", res)

presigned_url = res.get('data', {}).get(key)
print("\nPresigned URL:", presigned_url)

if presigned_url:
    print("\n--- FETCHING S3 PRESIGNED URL DIRECTLY ---")
    s3_res = requests.get(presigned_url, timeout=10)
    print("S3 HTTP Status Code:", s3_res.status_code)
    print("S3 Content-Type:", s3_res.headers.get('Content-Type'))
    print("S3 Content-Length:", len(s3_res.content))
    if s3_res.status_code != 200:
        print("S3 Error Body:", s3_res.text[:500])
