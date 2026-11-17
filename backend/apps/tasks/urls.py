from rest_framework.routers import DefaultRouter
from .views import TaskViewSet, HindranceViewSet, OtnViewSet

router = DefaultRouter()
router.register(r'hindrances', HindranceViewSet, basename='hindrance')
router.register(r'otn', OtnViewSet, basename='otn')
router.register(r'', TaskViewSet, basename='task')

urlpatterns = router.urls
