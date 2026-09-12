from rest_framework.routers import DefaultRouter
from .views import RefuelViewSet

router = DefaultRouter()
router.register(r'', RefuelViewSet, basename='refuel')

urlpatterns = router.urls
