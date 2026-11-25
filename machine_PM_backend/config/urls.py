from django.urls import path, include

urlpatterns = [
    path('api/v1/pm/', include('apps.maintenance.urls')),
    path('api/v1/machine-maintenance/', include('apps.maintenance.mobile_urls')),
]
