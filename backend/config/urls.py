from django.contrib import admin
from django.urls import path, include
from django.http import JsonResponse

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
