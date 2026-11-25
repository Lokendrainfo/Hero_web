import tempfile
from .base import *

TESTING = True
DEBUG = True

_TEST_DB_DIR = Path(tempfile.mkdtemp(prefix='pm_test_dbs_'))

DATABASES = {
    'default': {
        'ENGINE': 'django.db.backends.sqlite3',
        'NAME': _TEST_DB_DIR / 'test_machine_pm_db.sqlite3',
    },
    'hero': {
        'ENGINE': 'django.db.backends.sqlite3',
        'NAME': _TEST_DB_DIR / 'test_hero_hdd_db.sqlite3',
    },
}

MEDIA_ROOT = Path(tempfile.mkdtemp(prefix='pm_test_media_'))
PM_MAX_PHOTO_SIZE_MB = 5
PM_MAX_PHOTO_SIZE_BYTES = PM_MAX_PHOTO_SIZE_MB * 1024 * 1024
