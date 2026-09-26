import os
import threading
import logging
from django.apps import AppConfig

logger = logging.getLogger(__name__)

class UsersConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'apps.users'

    def ready(self):
        import sys
        if 'test' in sys.argv:
            return

        # Prevent running twice during Django autoreload in development
        if os.environ.get('RUN_MAIN') != 'true' and os.environ.get('SERVER_GATEWAY_INTERFACE') is not None:
            return

        def run_background_user_sync():
            import time
            while True:
                try:
                    from apps.integrations.ilync_user_sync import fetch_and_sync_all_ilync_users
                    logger.info("Starting background scan for external ILYNC users...")
                    synced = fetch_and_sync_all_ilync_users(max_pages=100, size=100)
                    logger.info(
                        "Background scan completed: %d total synced (created=%s, updated=%s).",
                        len(synced), getattr(synced, 'created', 0), getattr(synced, 'updated', 0)
                    )
                except Exception as e:
                    logger.warning("Background user sync skipped or failed: %s", e)
                # Sleep for 5 minutes before next background sync cycle
                time.sleep(300)

        # Run background sync in a daemon thread
        thread = threading.Thread(target=run_background_user_sync, daemon=True)
        thread.start()
