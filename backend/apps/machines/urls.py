from rest_framework.routers import DefaultRouter
from .views import MachineViewSet

router = DefaultRouter()
router.register(r'', MachineViewSet, basename='machine')

urlpatterns = router.urls
