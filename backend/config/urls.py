from django.contrib import admin
from django.urls import path, include
from django.http import JsonResponse
from django.conf import settings
from django.conf.urls.static import static

admin.site.site_header = 'HERO Administration'
admin.site.site_title = 'HERO Admin'
admin.site.index_title = 'Fleet & operations data'

def root_api_status(request):
    return JsonResponse({
        "status": "running",
        "service": "HERO WEB Django REST API",
        "api_v1": "/api/v1/",
        "admin": "/admin/",
        "frontend": "http://localhost:3000/"
    })

urlpatterns = [
    path('', root_api_status, name='api-root-status'),
    path('admin/', admin.site.urls),
    path('api/v1/', include('config.api_urls')),
    path('api/', include('config.api_urls')),
]

urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)

