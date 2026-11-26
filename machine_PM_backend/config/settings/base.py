import os
import urllib.parse as urlparse
from datetime import timedelta
from pathlib import Path
import dotenv

BASE_DIR = Path(__file__).resolve().parent.parent.parent
dotenv.load_dotenv(BASE_DIR / '.env')

SECRET_KEY = os.environ.get('SECRET_KEY', 'django-insecure-hero-web-enterprise-secret-key-2026')
DEBUG = os.environ.get('DEBUG', 'True') == 'True'

raw_hosts = os.environ.get('ALLOWED_HOSTS', 'localhost,127.0.0.1,0.0.0.0').split(',')
ALLOWED_HOSTS = [h.strip() for h in raw_hosts if h.strip()]

SECURE_PROXY_SSL_HEADER = ('HTTP_X_FORWARDED_PROTO', 'https')
USE_X_FORWARDED_HOST = True
USE_X_FORWARDED_PORT = True

TESTING = False

INSTALLED_APPS = [
    'django.contrib.auth',
    'django.contrib.contenttypes',
    'django.contrib.sessions',
    'django.contrib.messages',
    'django.contrib.staticfiles',
    # Third-party
    'rest_framework',
    'corsheaders',
    'django_filters',
    # PM Backend Apps
    'apps.common',
    'apps.hero_integration',
    'apps.maintenance',
]

MIDDLEWARE = [
    'django.middleware.security.SecurityMiddleware',
    'corsheaders.middleware.CorsMiddleware',
    'django.middleware.common.CommonMiddleware',
    'django.middleware.clickjacking.XFrameOptionsMiddleware',
]

ROOT_URLCONF = 'config.urls'
WSGI_APPLICATION = 'config.wsgi.application'
ASGI_APPLICATION = 'config.asgi.application'

TEMPLATES = [
    {
        'BACKEND': 'django.template.backends.django.DjangoTemplates',
        'DIRS': [],
        'APP_DIRS': True,
        'OPTIONS': {
            'context_processors': [
                'django.template.context_processors.debug',
                'django.template.context_processors.request',
            ],
        },
    },
]

def _parse_database_url(db_url: str, fallback_sqlite_path: Path) -> dict:
    if db_url.startswith('sqlite'):
        parsed = urlparse.urlparse(db_url)
        sqlite_name = parsed.path if (parsed.path and parsed.path not in ('/', ':memory:')) else fallback_sqlite_path
        return {
            'ENGINE': 'django.db.backends.sqlite3',
            'NAME': sqlite_name,
        }
    url = urlparse.urlparse(db_url)
    return {
        'ENGINE': 'django.db.backends.postgresql',
        'NAME': url.path.lstrip('/') or 'machine_pm_db',
        'USER': url.username or 'postgres',
        'PASSWORD': url.password or 'postgres',
        'HOST': url.hostname or '127.0.0.1',
        'PORT': str(url.port or 5432),
    }


# Primary Database – Machine PM (`machine_pm_db`)
DATABASE_URL = os.environ.get('DATABASE_URL', 'postgresql://postgres:postgres@127.0.0.1:5432/machine_pm_db')
# Secondary Database – HERO Integration (`hero_hdd_db`, read-only)
HERO_DATABASE_URL = os.environ.get('HERO_DATABASE_URL', 'postgresql://postgres:postgres@127.0.0.1:5432/hero_hdd_db')

DATABASES = {
    'default': _parse_database_url(DATABASE_URL, BASE_DIR / 'pm_db.sqlite3'),
    'hero': _parse_database_url(HERO_DATABASE_URL, BASE_DIR / 'hero_db.sqlite3'),
}

DATABASE_ROUTERS = ['config.db_router.HeroPMDatabaseRouter']

LANGUAGE_CODE = 'en-us'
TIME_ZONE = 'Asia/Kolkata'
USE_I18N = True
USE_TZ = True

STATIC_URL = '/static/'
STATIC_ROOT = BASE_DIR / 'staticfiles'

MEDIA_URL = '/media/'
_media_root = os.environ.get('PM_MEDIA_ROOT', 'media')
MEDIA_ROOT = Path(_media_root) if Path(_media_root).is_absolute() else (BASE_DIR / _media_root)

DEFAULT_AUTO_FIELD = 'django.db.models.BigAutoField'

REST_FRAMEWORK = {
    'DEFAULT_AUTHENTICATION_CLASSES': (
        'apps.hero_integration.authentication.HeroJWTAuthentication',
        'apps.hero_integration.authentication.HeroAPIKeyAuthentication',
    ),
    'DEFAULT_PERMISSION_CLASSES': (
        'rest_framework.permissions.IsAuthenticated',
    ),
    'DEFAULT_PAGINATION_CLASS': 'apps.common.pagination.StandardPageNumberPagination',
    'PAGE_SIZE': 20,
    'DEFAULT_FILTER_BACKENDS': (
        'django_filters.rest_framework.DjangoFilterBackend',
        'rest_framework.filters.SearchFilter',
        'rest_framework.filters.OrderingFilter',
    ),
    'EXCEPTION_HANDLER': 'apps.common.exceptions.custom_exception_handler',
}

SIMPLE_JWT = {
    'ACCESS_TOKEN_LIFETIME': timedelta(minutes=int(os.environ.get('JWT_ACCESS_TOKEN_LIFETIME', 1440))),
    'REFRESH_TOKEN_LIFETIME': timedelta(minutes=int(os.environ.get('JWT_REFRESH_TOKEN_LIFETIME', 10080))),
    'AUTH_HEADER_TYPES': ('Bearer',),
    'USER_ID_FIELD': 'id',
    'USER_ID_CLAIM': 'user_id',
    'SIGNING_KEY': SECRET_KEY,
}

raw_cors = os.environ.get(
    'CORS_ALLOWED_ORIGINS',
    'http://localhost:3000,http://127.0.0.1:3000,https://hero.pramaanu.co.in',
)
CORS_ALLOWED_ORIGINS = [o.strip() for o in raw_cors.split(',') if o.strip()]
CORS_ALLOW_CREDENTIALS = True

raw_csrf = os.environ.get(
    'CSRF_TRUSTED_ORIGINS',
    'http://localhost:3000,http://127.0.0.1:3000,https://hero.pramaanu.co.in,https://*.pramaanu.co.in',
)
CSRF_TRUSTED_ORIGINS = [o.strip() for o in raw_csrf.split(',') if o.strip()]

# Photo Evidence Storage & Validation (stored as PostgreSQL BYTEA in machine_pm_db)
PM_MAX_PHOTO_SIZE_MB = int(os.environ.get('PM_MAX_PHOTO_SIZE_MB', 10))
PM_MAX_PHOTO_SIZE_BYTES = PM_MAX_PHOTO_SIZE_MB * 1024 * 1024
PM_PHOTO_MAX_DIMENSION = int(os.environ.get('PM_PHOTO_MAX_DIMENSION', 1600))
PM_PHOTO_JPEG_QUALITY = int(os.environ.get('PM_PHOTO_JPEG_QUALITY', 82))
PM_ALLOWED_PHOTO_EXTENSIONS = [
    ext.strip().lower().lstrip('.')
    for ext in os.environ.get('PM_ALLOWED_PHOTO_EXTENSIONS', 'jpg,jpeg,png,webp').split(',')
    if ext.strip()
]
PM_MAX_VIDEO_SIZE_MB = int(os.environ.get('PM_MAX_VIDEO_SIZE_MB', 25))
PM_MAX_VIDEO_SIZE_BYTES = PM_MAX_VIDEO_SIZE_MB * 1024 * 1024
PM_ALLOWED_VIDEO_EXTENSIONS = [
    ext.strip().lower().lstrip('.')
    for ext in os.environ.get('PM_ALLOWED_VIDEO_EXTENSIONS', 'mp4,webm,mov,mkv').split(',')
    if ext.strip()
]
PM_SOP_EXCEL_PATH = os.environ.get(
    'PM_SOP_EXCEL_PATH',
    r'C:\Users\Lokendra\Downloads\Standard Operating Procedure- A600V2.xlsx',
)

