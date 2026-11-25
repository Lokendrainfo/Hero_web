import tempfile
from .base import *

TESTING = True
DEBUG = True

DATABASES = {
    'default': {
        'ENGINE': 'django.db.backends.sqlite3',
        'NAME': ':memory:',
    }
}

MEDIA_ROOT = Path(tempfile.mkdtemp(prefix='pm_test_media_'))
PM_MAX_PHOTO_SIZE_MB = 5
PM_MAX_PHOTO_SIZE_BYTES = PM_MAX_PHOTO_SIZE_MB * 1024 * 1024

