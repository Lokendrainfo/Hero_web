from rest_framework.routers import DefaultRouter
from .views import ExpenseViewSet, ExpenseCategoryViewSet, ExpenseSubCategoryViewSet

router = DefaultRouter()
router.register(r'categories', ExpenseCategoryViewSet, basename='expense-category')
router.register(r'subcategories', ExpenseSubCategoryViewSet, basename='expense-subcategory')
router.register(r'', ExpenseViewSet, basename='expense')

urlpatterns = router.urls
