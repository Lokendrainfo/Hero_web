import json
import base64
from datetime import datetime
from django.core.signing import TimestampSigner, BadSignature, SignatureExpired
from django.conf import settings

SALT = 'bharatnet-td-live-view'

def generate_bharatnet_live_token(task_id, machine_id=None, user_id=None, date_str=None):
    """
    Generate a tamper-proof cryptographic signed token for read-only live-view URL.
    Encodes task_id, machine_id, user_id, and date without exposing raw database IDs or credentials.
    """
    payload = {
        'tid': str(task_id or ''),
        'm': str(machine_id or ''),
        'u': str(user_id or ''),
        'd': str(date_str or ''),
    }
    raw_json = json.dumps(payload, separators=(',', ':'))
    encoded = base64.urlsafe_b64encode(raw_json.encode('utf-8')).decode('utf-8').rstrip('=')
    signer = TimestampSigner(salt=SALT)
    return signer.sign(encoded)

def verify_bharatnet_live_token(token, max_age_seconds=86400 * 30):
    """
    Verify and decode a cryptographic token for live-view.
    Returns payload dict or None if invalid or expired.
    """
    if not token or not isinstance(token, str):
        return None
    signer = TimestampSigner(salt=SALT)
    try:
        encoded = signer.unsign(token, max_age=max_age_seconds)
        # Re-add padding
        missing_padding = len(encoded) % 4
        if missing_padding:
            encoded += '=' * (4 - missing_padding)
        raw_json = base64.urlsafe_b64decode(encoded.encode('utf-8')).decode('utf-8')
        return json.loads(raw_json)
    except (BadSignature, SignatureExpired, Exception):
        return None
