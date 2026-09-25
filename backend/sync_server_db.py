#!/usr/bin/env python
"""
Standalone Server Database Synchronization Script.
Rule: Zero deletions. Non-destructive sync of Vendor and User mappings from iLync.

Usage on server:
    python sync_server_db.py
"""
import os
import sys

# Configure Django environment
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings.production')
try:
    import django
    django.setup()
except Exception:
    os.environ['DJANGO_SETTINGS_MODULE'] = 'config.settings.development'
    import django
    django.setup()

from django.core.management import call_command

if __name__ == '__main__':
    print("Executing safe, non-destructive synchronization with live iLync master data...")
    call_command('sync_ilync_vendors')
    print("Finished.")
