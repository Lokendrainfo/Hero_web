from django.urls import path
from .views import TeamListView

urlpatterns = [
    path('members/', TeamListView.as_view(), name='team_members'),
]
