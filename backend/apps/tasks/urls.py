from rest_framework.routers import DefaultRouter
from .views import TaskViewSet, HindranceViewSet

router = DefaultRouter()
router.register(r'hindrances', HindranceViewSet, basename='hindrance')
router.register(r'', TaskViewSet, basename='task')

urlpatterns = router.urls
