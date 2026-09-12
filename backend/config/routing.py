from django.urls import re_path
from apps.tracking.consumers import TrackingConsumer

websocket_urlpatterns = [
    re_path(r'ws/tracking/$', TrackingConsumer.as_asgi()),
    re_path(r'ws/tracking/machine/(?P<machine_id>\w+)/$', TrackingConsumer.as_asgi()),
    re_path(r'ws/tracking/vendor/(?P<vendor_id>\w+)/$', TrackingConsumer.as_asgi()),
]
