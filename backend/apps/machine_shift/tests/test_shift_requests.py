import os
from decimal import Decimal
from django.test import TestCase
from django.core.files.uploadedfile import SimpleUploadedFile
from django.utils import timezone
from rest_framework.test import APIClient
from rest_framework import status
from apps.authentication.models import User
from apps.vendors.models import Vendor, HeroVendorAssignment
from apps.machines.models import Machine
from apps.roles.models import Role, Permission, RolePermission, UserRole
from apps.roles.services import seed_roles_and_permissions
from apps.machine_shift.models import MachineShiftReason, MachineShiftRequest, MachineShiftRequestAudit


class MachineShiftRequestTests(TestCase):
    def setUp(self):
        seed_roles_and_permissions()

        # Vendors
        self.vendor1 = Vendor.objects.create(name="Alpha Infraworks", code="VND-ALPHA", is_active=True)
        self.vendor2 = Vendor.objects.create(name="Beta HDD Services", code="VND-BETA", is_active=True)

        # Machines
        self.machine1 = Machine.objects.create(
            name="Apollo Rig 101",
            serial_number="SN-APOLLO-101",
            machine_chassis_no="CHS-101",
            vendor=self.vendor1
        )
        self.machine2 = Machine.objects.create(
            name="Apollo Rig 202",
            serial_number="SN-APOLLO-202",
            machine_chassis_no="CHS-202",
            vendor=self.vendor2
        )

        # Shift Reason
        self.reason = MachineShiftReason.objects.create(
            name="New Task",
            code="NEW_TASK",
            description="Shift for newly allocated HDD project"
        )

        # Users
        self.admin = User.objects.create_superuser(
            username="admin_user",
            email="admin@hero.com",
            password="password123"
        )

        # Requester (Vendor 1)
        self.requester = User.objects.create_user(
            username="requester_v1",
            email="req1@alpha.com",
            password="password123",
            vendor=self.vendor1,
            role="VENDOR_ADMIN"
        )
        HeroVendorAssignment.objects.create(user=self.requester, vendor=self.vendor1)
        vendor_admin_role = Role.objects.filter(code="VENDOR_ADMIN").first()
        if vendor_admin_role:
            UserRole.objects.create(user=self.requester, role=vendor_admin_role)

        # Other Vendor User (Vendor 2)
        self.other_vendor_user = User.objects.create_user(
            username="requester_v2",
            email="req2@beta.com",
            password="password123",
            vendor=self.vendor2,
            role="VENDOR_ADMIN"
        )
        HeroVendorAssignment.objects.create(user=self.other_vendor_user, vendor=self.vendor2)
        if vendor_admin_role:
            UserRole.objects.create(user=self.other_vendor_user, role=vendor_admin_role)

        # Shifter User
        self.shifter = User.objects.create_user(
            username="shifter_user",
            email="shifter@hero.com",
            password="password123",
            role="SHIFTER"
        )
        shifter_role = Role.objects.filter(code="SHIFTER").first()
        if shifter_role:
            UserRole.objects.create(user=self.shifter, role=shifter_role)

        # SCM User
        self.scm_user = User.objects.create_user(
            username="scm_parvej",
            email="parvej.scm@hero.com",
            password="password123",
            role="SCM"
        )
        scm_role = Role.objects.filter(code="SCM").first()
        if scm_role:
            UserRole.objects.create(user=self.scm_user, role=scm_role)

        # Unauthorized Viewer
        self.viewer = User.objects.create_user(
            username="viewer_user",
            email="viewer@hero.com",
            password="password123",
            role="VIEWER"
        )

        self.client = APIClient()

        # Dummy files
        self.dummy_picture = SimpleUploadedFile(
            name="machine_photo.jpg",
            content=b"\xff\xd8\xff\xe0\x00\x10JFIF\x00\x01\x01\x01\x00`\x00`\x00\x00",
            content_type="image/jpeg"
        )
        self.dummy_invoice = SimpleUploadedFile(
            name="transport_invoice.pdf",
            content=b"%PDF-1.4 header test content",
            content_type="application/pdf"
        )

    # 1. Request Creation
    def test_01_request_creation(self):
        self.client.force_authenticate(user=self.requester)
        payload = {
            "vendor": self.vendor1.id,
            "machine": self.machine1.id,
            "reason": self.reason.id,
            "a_point_name": "Site Alpha Crossing",
            "a_point_latitude": "28.459500",
            "a_point_longitude": "77.026600",
            "b_point_name": "Site Beta Junction",
            "b_point_latitude": "28.490000",
            "b_point_longitude": "77.080000",
            "required_date": timezone.now().date().isoformat(),
            "mode_of_shifting": "OWN_HDD"
        }
        res = self.client.post("/api/v1/machine-shift/machine-shift-requests/", payload, format="json")
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        self.assertTrue(res.data.get("request_id").startswith("MSR-"))
        self.assertEqual(res.data.get("status"), "PENDING_SHIFTING")
        self.assertEqual(res.data.get("created_by"), self.requester.id)

    # 2. Vendor-Machine validation & 3. Invalid machine/vendor combination rejected
    def test_02_invalid_machine_vendor_combination_rejected(self):
        self.client.force_authenticate(user=self.admin)
        # Attempt to pair machine2 (Beta) with vendor1 (Alpha)
        payload = {
            "vendor": self.vendor1.id,
            "machine": self.machine2.id, # Belongs to vendor2!
            "reason": self.reason.id,
            "a_point_name": "Site A",
            "b_point_name": "Site B",
            "required_date": timezone.now().date().isoformat(),
            "mode_of_shifting": "BY_TRUCK"
        }
        res = self.client.post("/api/v1/machine-shift/machine-shift-requests/", payload, format="json")
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("machine", str(res.data))

    # 4. Requester authorization (cannot create for another vendor)
    def test_03_requester_authorization_vendor_scoping(self):
        self.client.force_authenticate(user=self.requester)
        # Requester belongs to vendor1, trying to create for vendor2
        payload = {
            "vendor": self.vendor2.id,
            "machine": self.machine2.id,
            "a_point_name": "Site A",
            "b_point_name": "Site B",
            "required_date": timezone.now().date().isoformat(),
            "mode_of_shifting": "BY_TRUCK"
        }
        res = self.client.post("/api/v1/machine-shift/machine-shift-requests/", payload, format="json")
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("authorized", str(res.data).lower())

    def _create_sample_request(self, status_val="PENDING_SHIFTING"):
        req_id = MachineShiftRequest.generate_unique_request_id()
        instance = MachineShiftRequest.objects.create(
            request_id=req_id,
            vendor=self.vendor1,
            machine=self.machine1,
            reason=self.reason,
            a_point_name="Site A",
            a_point_latitude=Decimal("28.450000"),
            a_point_longitude=Decimal("77.020000"),
            b_point_name="Site B",
            b_point_latitude=Decimal("28.500000"),
            b_point_longitude=Decimal("77.050000"),
            required_date=timezone.now().date(),
            mode_of_shifting="OWN_HDD",
            status=status_val,
            created_by=self.requester
        )
        return instance

    # 5. Shifter authorization & 6. SCM authorization
    def test_04_shifter_and_scm_authorization_checks(self):
        req = self._create_sample_request()

        # Requester or Viewer cannot SCM approve
        self.client.force_authenticate(user=self.requester)
        res = self.client.post(f"/api/v1/machine-shift/machine-shift-requests/{req.id}/scm-approve/")
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)

        # Viewer cannot perform shifter action
        self.client.force_authenticate(user=self.viewer)
        res = self.client.post(f"/api/v1/machine-shift/machine-shift-requests/{req.id}/start-shifting/")
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)

    # 7. SCM approval
    def test_05_scm_approval(self):
        req = self._create_sample_request(status_val="PENDING_SHIFTING")
        self.client.force_authenticate(user=self.scm_user)

        res = self.client.post(
            f"/api/v1/machine-shift/machine-shift-requests/{req.id}/scm-approve/",
            {"remarks": "Approved by SCM Parvej"},
            format="json"
        )
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        req.refresh_from_db()
        self.assertEqual(req.status, "APPROVED_BY_SCM")
        self.assertEqual(req.scm_approved_by, self.scm_user)
        self.assertIsNotNone(req.scm_approved_at)

        # Audit log verified
        audit = req.audit_logs.filter(action="SCM_APPROVED").first()
        self.assertIsNotNone(audit)
        self.assertEqual(audit.performed_by, self.scm_user)

    # 8. SCM rejection
    def test_06_scm_rejection(self):
        req = self._create_sample_request(status_val="PENDING_SHIFTING")
        self.client.force_authenticate(user=self.scm_user)

        res = self.client.post(
            f"/api/v1/machine-shift/machine-shift-requests/{req.id}/scm-reject/",
            {"rejection_reason": "No valid site handover documents attached."},
            format="json"
        )
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        req.refresh_from_db()
        self.assertEqual(req.status, "REJECTED")
        self.assertEqual(req.rejected_by, self.scm_user)
        self.assertEqual(req.rejection_reason, "No valid site handover documents attached.")

        # Rejection blocks shifting
        self.client.force_authenticate(user=self.shifter)
        res_shift = self.client.post(f"/api/v1/machine-shift/machine-shift-requests/{req.id}/start-shifting/")
        self.assertEqual(res_shift.status_code, status.HTTP_400_BAD_REQUEST)

    # 9. Shifter update
    def test_07_shifter_update(self):
        req = self._create_sample_request(status_val="APPROVED_BY_SCM")
        self.client.force_authenticate(user=self.shifter)

        # Shifter starts shifting
        res = self.client.post(f"/api/v1/machine-shift/machine-shift-requests/{req.id}/start-shifting/")
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        req.refresh_from_db()
        self.assertEqual(req.status, "IN_PROGRESS")

        # Shifter updates shifting details
        update_data = {
            "shifting_date": timezone.now().date().isoformat(),
            "shifting_mode": "By Lowbed Truck DL-1A-9999",
            "shifting_contact_person": "Ramesh Driver (9876543210)",
            "shifting_expense_amount": "4500.00",
            "remarks": "Truck loaded and en route"
        }
        res_update = self.client.post(
            f"/api/v1/machine-shift/machine-shift-requests/{req.id}/shifter-update/",
            update_data,
            format="json"
        )
        self.assertEqual(res_update.status_code, status.HTTP_200_OK)
        req.refresh_from_db()
        self.assertEqual(str(req.shifting_expense_amount), "4500.00")
        self.assertEqual(req.shifting_contact_person, "Ramesh Driver (9876543210)")

    # 10. Machine picture upload & 11. Expense validation
    def test_08_machine_picture_and_expense_validation(self):
        req = self._create_sample_request(status_val="IN_PROGRESS")
        self.client.force_authenticate(user=self.shifter)

        # Negative expense rejected
        res = self.client.post(
            f"/api/v1/machine-shift/machine-shift-requests/{req.id}/shifter-update/",
            {"shifting_expense_amount": "-500.00"},
            format="json"
        )
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)

        # Valid upload
        pic = SimpleUploadedFile("rig_photo.jpg", b"fakejpgcontent", content_type="image/jpeg")
        res_upload = self.client.post(
            f"/api/v1/machine-shift/machine-shift-requests/{req.id}/shifter-update/",
            {
                "shifting_expense_amount": "2500.00",
                "machine_picture": pic
            },
            format="multipart"
        )
        self.assertEqual(res_upload.status_code, status.HTTP_200_OK)
        req.refresh_from_db()
        self.assertTrue(bool(req.machine_picture))

    # 12. Cannot mark SHIFTED without required fields and machine picture
    def test_09_cannot_mark_shifted_without_picture_or_required_fields(self):
        req = self._create_sample_request(status_val="IN_PROGRESS")
        self.client.force_authenticate(user=self.shifter)

        # Missing picture
        res = self.client.post(
            f"/api/v1/machine-shift/machine-shift-requests/{req.id}/mark-shifted/",
            {
                "shifting_date": timezone.now().date().isoformat(),
                "shifting_mode": "Own-HDD",
                "shifting_contact_person": "Operator Suresh",
                "shifting_expense_amount": "1200.00"
            },
            format="json"
        )
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("machine_picture", str(res.data))

        # With picture -> succeeds
        pic = SimpleUploadedFile("rig_photo.png", b"fakepngcontent", content_type="image/png")
        res_ok = self.client.post(
            f"/api/v1/machine-shift/machine-shift-requests/{req.id}/mark-shifted/",
            {
                "shifting_date": timezone.now().date().isoformat(),
                "shifting_mode": "Own-HDD",
                "shifting_contact_person": "Operator Suresh",
                "shifting_expense_amount": "1200.00",
                "machine_picture": pic
            },
            format="multipart"
        )
        self.assertEqual(res_ok.status_code, status.HTTP_200_OK)
        req.refresh_from_db()
        self.assertEqual(req.status, "SHIFTED")

    # 13. Cannot CONFIRM without SCM approval
    def test_10_cannot_confirm_without_scm_approval(self):
        req = self._create_sample_request(status_val="SHIFTED")
        # Ensure scm_approved_at is empty
        req.scm_approved_at = None
        req.save()

        self.client.force_authenticate(user=self.scm_user)
        res = self.client.post(f"/api/v1/machine-shift/machine-shift-requests/{req.id}/confirm/")
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("approved by scm", str(res.data).lower())

    # 14. Invoice upload
    def test_11_invoice_upload(self):
        req = self._create_sample_request(status_val="SHIFTED")
        self.client.force_authenticate(user=self.scm_user)

        inv_file = SimpleUploadedFile("invoice_2026.pdf", b"%PDF-1.4 test", content_type="application/pdf")
        res = self.client.post(
            f"/api/v1/machine-shift/machine-shift-requests/{req.id}/attach-invoice/",
            {
                "invoice_file": inv_file,
                "invoice_number": "INV-MSR-0089",
                "invoice_date": timezone.now().date().isoformat(),
                "invoice_amount": "8500.00"
            },
            format="multipart"
        )
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        req.refresh_from_db()
        self.assertEqual(req.invoice_number, "INV-MSR-0089")
        self.assertEqual(str(req.invoice_amount), "8500.00")
        self.assertTrue(bool(req.invoice_file))

    # 15. Final confirmation & 20. Confirmed request cannot be normally edited
    def test_12_final_confirmation_and_lock(self):
        req = self._create_sample_request(status_val="SHIFTED")
        req.scm_approved_at = timezone.now()
        req.scm_approved_by = self.scm_user
        req.shifting_date = timezone.now().date()
        req.shifting_mode = "By Truck"
        req.shifting_contact_person = "Driver Rajesh"
        req.shifting_expense_amount = Decimal("3000.00")
        req.machine_picture = SimpleUploadedFile("pic.jpg", b"fakecontent", content_type="image/jpeg")
        req.save()

        self.client.force_authenticate(user=self.scm_user)
        res = self.client.post(f"/api/v1/machine-shift/machine-shift-requests/{req.id}/confirm/")
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        req.refresh_from_db()
        self.assertEqual(req.status, "CONFIRMED")
        self.assertEqual(req.confirmed_by, self.scm_user)

        # Locked from normal editing by requester
        self.client.force_authenticate(user=self.requester)
        res_edit = self.client.patch(
            f"/api/v1/machine-shift/machine-shift-requests/{req.id}/",
            {"a_point_name": "Tampered Origin Site"},
            format="json"
        )
        self.assertEqual(res_edit.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("locked", str(res_edit.data).lower())

        # Locked from Shifter updates
        self.client.force_authenticate(user=self.shifter)
        res_shifter = self.client.post(
            f"/api/v1/machine-shift/machine-shift-requests/{req.id}/shifter-update/",
            {"shifting_expense_amount": "9999.00"},
            format="json"
        )
        self.assertEqual(res_shifter.status_code, status.HTTP_400_BAD_REQUEST)

    # 16. Unauthorized user cannot access another vendor's request
    def test_13_unauthorized_user_vendor_isolation(self):
        req = self._create_sample_request(status_val="PENDING_SHIFTING")
        self.client.force_authenticate(user=self.other_vendor_user)

        # Detail fetch should return 404 or filtered out
        res = self.client.get(f"/api/v1/machine-shift/machine-shift-requests/{req.id}/")
        self.assertIn(res.status_code, [status.HTTP_404_NOT_FOUND, status.HTTP_403_FORBIDDEN])

    # 17. Invalid status transition rejected
    def test_14_invalid_status_transition_rejected(self):
        req = self._create_sample_request(status_val="PENDING_SHIFTING")
        self.client.force_authenticate(user=self.shifter)

        # Cannot mark shifted directly from PENDING_SHIFTING (must be approved first)
        pic = SimpleUploadedFile("rig.jpg", b"fake", content_type="image/jpeg")
        res = self.client.post(
            f"/api/v1/machine-shift/machine-shift-requests/{req.id}/mark-shifted/",
            {
                "shifting_date": timezone.now().date().isoformat(),
                "shifting_mode": "Own-HDD",
                "shifting_contact_person": "Contact Person",
                "shifting_expense_amount": "1000.00",
                "machine_picture": pic
            },
            format="multipart"
        )
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)

    # 18. Duplicate submission protection & unique request ID
    def test_15_duplicate_submission_protection(self):
        self.client.force_authenticate(user=self.requester)
        payload = {
            "vendor": self.vendor1.id,
            "machine": self.machine1.id,
            "reason": self.reason.id,
            "a_point_name": "Point A",
            "b_point_name": "Point B",
            "required_date": timezone.now().date().isoformat(),
            "mode_of_shifting": "OWN_HDD"
        }
        res1 = self.client.post("/api/v1/machine-shift/machine-shift-requests/", payload, format="json")
        res2 = self.client.post("/api/v1/machine-shift/machine-shift-requests/", payload, format="json")
        self.assertEqual(res1.status_code, status.HTTP_201_CREATED)
        self.assertEqual(res2.status_code, status.HTTP_201_CREATED)
        # Unique IDs generated
        self.assertNotEqual(res1.data["request_id"], res2.data["request_id"])

    # 19. Audit records created
    def test_16_audit_trail_created_on_events(self):
        req = self._create_sample_request()
        initial_audits = MachineShiftRequestAudit.objects.filter(request=req).count()

        self.client.force_authenticate(user=self.scm_user)
        self.client.post(
            f"/api/v1/machine-shift/machine-shift-requests/{req.id}/scm-approve/",
            {"remarks": "Audit check remarks"}
        )

        after_audits = MachineShiftRequestAudit.objects.filter(request=req).count()
        self.assertGreater(after_audits, initial_audits)
        latest_audit = MachineShiftRequestAudit.objects.filter(request=req).latest('created_at')
        self.assertEqual(latest_audit.action, "SCM_APPROVED")
        self.assertEqual(latest_audit.performed_by, self.scm_user)

    # 21. Physical deletion rejected
    def test_17_physical_delete_prohibited(self):
        req = self._create_sample_request()
        self.client.force_authenticate(user=self.admin)
        res = self.client.delete(f"/api/v1/machine-shift/machine-shift-requests/{req.id}/")
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertTrue(MachineShiftRequest.objects.filter(id=req.id).exists())

    # 22. Cancellation workflow
    def test_18_requester_can_cancel_pending_request(self):
        req = self._create_sample_request(status_val="PENDING_SHIFTING")
        self.client.force_authenticate(user=self.requester)
        res = self.client.post(
            f"/api/v1/machine-shift/machine-shift-requests/{req.id}/cancel/",
            {"remarks": "No longer needed."}
        )
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        req.refresh_from_db()
        self.assertEqual(req.status, "CANCELLED")

    # CSV Export
    def test_19_csv_export(self):
        self._create_sample_request()
        self.client.force_authenticate(user=self.admin)
        res = self.client.get("/api/v1/machine-shift/machine-shift-requests/export/")
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res["Content-Type"], "text/csv")
        self.assertIn("Request ID", res.content.decode("utf-8"))
