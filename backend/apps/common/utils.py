import uuid
import datetime

def generate_unique_code(prefix="HR"):
    return f"{prefix}-{datetime.datetime.now().strftime('%Y%m%d')}-{uuid.uuid4().hex[:6].upper()}"
