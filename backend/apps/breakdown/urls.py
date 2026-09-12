from rest_framework.routers import DefaultRouter
from .views import BreakdownViewSet

router = DefaultRouter()
router.register(r'', BreakdownViewSet, basename='breakdown')

urlpatterns = router.urls
