from django.test import TestCase
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APIClient
from apps.authentication.models import User
from apps.vendors.models import Vendor

class AuthenticationTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.vendor = Vendor.objects.create(name="TEST VENDOR", code="TESTV")
        self.user = User.objects.create_user(
            username="testuser",
            password="password123",
            email="testuser@example.com",
            vendor=self.vendor,
            role="ADMIN"
        )

    def test_login_with_valid_username_and_password(self):
        url = reverse('login')
        response = self.client.post(url, {'username': 'testuser', 'password': 'password123'}, format='json')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertTrue(response.data['success'])
        self.assertIn('access_token', response.data['data'])
        self.assertIn('refresh_token', response.data['data'])

    def test_login_with_invalid_password(self):
        url = reverse('login')
        response = self.client.post(url, {'username': 'testuser', 'password': 'wrongpassword'}, format='json')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertFalse(response.data['success'])
