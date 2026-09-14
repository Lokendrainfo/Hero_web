import os
import threading
import logging
from django.apps import AppConfig

logger = logging.getLogger(__name__)

class UsersConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'apps.users'

    def ready(self):
        # Prevent running twice during Django autoreload in development
        if os.environ.get('RUN_MAIN') != 'true' and os.environ.get('SERVER_GATEWAY_INTERFACE') is not None:
            return

        def run_background_user_sync():
            try:
                from apps.integrations.ilync_user_sync import fetch_and_sync_all_ilync_users
                logger.info("Starting background scan for external ILYNC users...")
                synced = fetch_and_sync_all_ilync_users(max_pages=20, size=50)
                logger.info("Background scan finished: synced %d users into local DB.", len(synced))
            except Exception as e:
                logger.warning("Background user sync skipped or failed: %s", e)

        # Run background sync once in a daemon thread on server startup
        thread = threading.Thread(target=run_background_user_sync, daemon=True)
        thread.start()
