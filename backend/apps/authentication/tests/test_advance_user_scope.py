from django.test import TestCase
from django.core.exceptions import ValidationError
from apps.authentication.models import User
from apps.common.models import Circle, District, Block

class AdvanceUserScopeTestCase(TestCase):
    def setUp(self):
        self.circle_haryana = Circle.objects.create(name="Haryana", code="HAR")
        self.district_gurugram = District.objects.create(circle=self.circle_haryana, name="Gurugram", code="GUR")
        self.block_sohna = Block.objects.create(district=self.district_gurugram, name="Sohna", code="SOH")

        self.circle_rajasthan = Circle.objects.create(name="Rajasthan", code="RAJ")
        self.district_ganganagar = District.objects.create(circle=self.circle_rajasthan, name="Ganganagar", code="GAN")

    def test_normal_user_creation(self):
        user = User.objects.create(username="normal_user", user_type="NORMAL")
        self.assertEqual(user.user_type, "NORMAL")
        self.assertIsNone(user.advance_scope_type)
        self.assertIsNone(user.selected_circle)
        self.assertIsNone(user.selected_district)
        self.assertIsNone(user.selected_block)

    def test_advance_circle_user(self):
        user = User.objects.create(
            username="circle_user",
            user_type="ADVANCE",
            advance_scope_type="CIRCLE",
            selected_circle=self.circle_haryana
        )
        self.assertEqual(user.user_type, "ADVANCE")
        self.assertEqual(user.advance_scope_type, "CIRCLE")
        self.assertEqual(user.selected_circle, self.circle_haryana)
        self.assertIsNone(user.selected_district)
        self.assertIsNone(user.selected_block)

    def test_advance_district_user(self):
        user = User.objects.create(
            username="district_user",
            user_type="ADVANCE",
            advance_scope_type="DISTRICT",
            selected_circle=self.circle_haryana,
            selected_district=self.district_gurugram
        )
        self.assertEqual(user.selected_district, self.district_gurugram)
        self.assertIsNone(user.selected_block)

    def test_advance_block_user(self):
        user = User.objects.create(
            username="block_user",
            user_type="ADVANCE",
            advance_scope_type="BLOCK",
            selected_circle=self.circle_haryana,
            selected_district=self.district_gurugram,
            selected_block=self.block_sohna
        )
        self.assertEqual(user.selected_block, self.block_sohna)

    def test_invalid_mismatched_district(self):
        user = User(
            username="invalid_user",
            user_type="ADVANCE",
            advance_scope_type="DISTRICT",
            selected_circle=self.circle_haryana,
            selected_district=self.district_ganganagar
        )
        with self.assertRaises(ValidationError):
            user.save()
