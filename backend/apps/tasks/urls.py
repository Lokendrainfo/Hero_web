from rest_framework.routers import DefaultRouter
from .views import TaskViewSet, HindranceViewSet, OtnViewSet, CcnViewSet

router = DefaultRouter()
router.register(r'hindrances', HindranceViewSet, basename='hindrance')
router.register(r'otn', OtnViewSet, basename='otn')
router.register(r'ccn', CcnViewSet, basename='ccn')
router.register(r'', TaskViewSet, basename='task')

urlpatterns = router.urls
