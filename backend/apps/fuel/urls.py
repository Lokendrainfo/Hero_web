from rest_framework.routers import DefaultRouter
from .views import FuelLogViewSet, FuelCardViewSet

router = DefaultRouter()
router.register(r'logs', FuelLogViewSet, basename='fuel_log')
router.register(r'cards', FuelCardViewSet, basename='fuel_card')

urlpatterns = router.urls
