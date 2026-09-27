from .base import *

DEBUG = False

ALLOWED_HOSTS = [h.strip() for h in os.environ.get('ALLOWED_HOSTS', '*').split(',') if h.strip()]
if '*' not in ALLOWED_HOSTS:
    for host in ['hero.pramaanu.co.in', '.pramaanu.co.in', 'localhost', '127.0.0.1', '0.0.0.0']:
        if host not in ALLOWED_HOSTS:
            ALLOWED_HOSTS.append(host)

CORS_ALLOW_ALL_ORIGINS = True
CORS_ALLOWED_ORIGINS = [
    "https://hero.pramaanu.co.in",
    "http://localhost:3000",
    "http://127.0.0.1:3000",
]
CSRF_TRUSTED_ORIGINS = [
    "https://hero.pramaanu.co.in",
    "https://*.pramaanu.co.in",
    "http://localhost:3000",
    "http://127.0.0.1:3000",
]
