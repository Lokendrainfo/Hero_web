from rest_framework import viewsets, permissions, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.views import APIView
from django.db.models import Q, Sum, Count
from django.utils import timezone
from django.http import HttpResponse
import csv
from datetime import datetime
from decimal import Decimal

from .models import Expense, ExpenseCategory, ExpenseSubCategory
from .serializers import ExpenseSerializer, ExpenseCategorySerializer, ExpenseSubCategorySerializer
from apps.common.responses import success_response, error_response
from apps.common.reporting_scope import filter_queryset_by_reporting_and_vendor
from apps.common.vendor_scope import get_user_vendor_ids

class IsAdminOrCategoryManager(permissions.BasePermission):
    """
    Permission class for Category and Subcategory Master APIs:
    - SAFE_METHODS (GET): Any authenticated user can read categories/subcategories.
    - WRITE (POST, PUT, PATCH, DELETE): Only ADMIN (superuser or 'ADMIN' role) or users with 'expenses.manage' permission.
    """
    def has_permission(self, request, view):
        if not request.user or not request.user.is_authenticated:
            return False
        if request.method in permissions.SAFE_METHODS:
            return True
        user_roles = [r.upper() for r in request.user.get_role_list()]
        if request.user.is_superuser or 'ADMIN' in user_roles or 'expenses.manage' in request.user.get_permission_codes():
            return True
        return False

class ExpenseCategoryViewSet(viewsets.ModelViewSet):
    queryset = ExpenseCategory.objects.all().prefetch_related('subcategories').order_by('order', 'name')
    serializer_class = ExpenseCategorySerializer
    permission_classes = [permissions.IsAuthenticated, IsAdminOrCategoryManager]

    def get_queryset(self):
        qs = ExpenseCategory.objects.all().prefetch_related('subcategories').order_by('order', 'name')
        show_all = self.request.query_params.get('all') == 'true'
        user_roles = [r.upper() for r in self.request.user.get_role_list()] if self.request.user.is_authenticated else []
        is_admin = self.request.user.is_superuser or 'ADMIN' in user_roles
        if not is_admin and not show_all:
            qs = qs.filter(is_active=True)

        search = self.request.query_params.get('search', '').strip()
        if search:
            qs = qs.filter(Q(name__icontains=search) | Q(code__icontains=search))
        return qs

    def destroy(self, request, *args, **kwargs):
        instance = self.get_object()
        try:
            return super().destroy(request, *args, **kwargs)
        except Exception as e:
            return error_response(
                message=f"Cannot delete category '{instance.name}' because related subcategories or expense records exist. You can set status to INACTIVE instead.",
                status_code=status.HTTP_400_BAD_REQUEST
            )

class ExpenseSubCategoryViewSet(viewsets.ModelViewSet):
    queryset = ExpenseSubCategory.objects.all().select_related('category').order_by('order', 'name')
    serializer_class = ExpenseSubCategorySerializer
    permission_classes = [permissions.IsAuthenticated, IsAdminOrCategoryManager]

    def get_queryset(self):
        qs = ExpenseSubCategory.objects.all().select_related('category').order_by('order', 'name')
        show_all = self.request.query_params.get('all') == 'true'
        user_roles = [r.upper() for r in self.request.user.get_role_list()] if self.request.user.is_authenticated else []
        is_admin = self.request.user.is_superuser or 'ADMIN' in user_roles
        if not is_admin and not show_all:
            qs = qs.filter(is_active=True)

        cat_id = self.request.query_params.get('category_id') or self.request.query_params.get('category')
        if cat_id and str(cat_id).strip() and cat_id != 'all':
            if str(cat_id).isdigit():
                qs = qs.filter(category_id=int(cat_id))
            else:
                qs = qs.filter(Q(category__name__iexact=cat_id) | Q(category__code__iexact=cat_id))

        search = self.request.query_params.get('search', '').strip()
        if search:
            qs = qs.filter(Q(name__icontains=search) | Q(code__icontains=search))
        return qs


class ExpenseViewSet(viewsets.ModelViewSet):
    queryset = Expense.objects.all()
    serializer_class = ExpenseSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        qs = filter_queryset_by_reporting_and_vendor(Expense.objects.all(), self.request.user)

        search = self.request.query_params.get('search', '').strip()
        category = self.request.query_params.get('category', '').strip()
        subcategory = self.request.query_params.get('subcategory', '').strip()
        payment_type = self.request.query_params.get('payment_type', '').strip()
        vendor_id = self.request.query_params.get('vendor_id', '').strip() or self.request.query_params.get('vendor', '').strip()
        machine_id = self.request.query_params.get('machine_id', '').strip() or self.request.query_params.get('machine', '').strip()
        task_id = self.request.query_params.get('task_id', '').strip() or self.request.query_params.get('task', '').strip()
        status_param = self.request.query_params.get('status', '').strip()
        payment_mode = self.request.query_params.get('payment_mode', '').strip()
        date_from = self.request.query_params.get('date_from', '').strip()
        date_to = self.request.query_params.get('date_to', '').strip()

        if search:
            qs = qs.filter(
                Q(expense_id__icontains=search) |
                Q(title__icontains=search) |
                Q(description__icontains=search) |
                Q(supplier_name__icontains=search) |
                Q(invoice_number__icontains=search) |
                Q(project__icontains=search) |
                Q(site__icontains=search) |
                Q(vendor__name__icontains=search) |
                Q(machine__name__icontains=search)
            )

        if category and category.upper() != 'ALL':
            qs = qs.filter(Q(category__iexact=category) | Q(category_ref__name__iexact=category) | Q(category_ref__code__iexact=category))

        if subcategory and subcategory.upper() != 'ALL':
            qs = qs.filter(Q(subcategory__iexact=subcategory) | Q(subcategory_ref__name__iexact=subcategory))

        if payment_type and payment_type.upper() != 'ALL':
            qs = qs.filter(Q(payment_type__iexact=payment_type) | Q(category_ref__payment_type__iexact=payment_type))

        if vendor_id and vendor_id.upper() != 'ALL':
            if vendor_id.isdigit():
                qs = qs.filter(vendor_id=int(vendor_id))
            else:
                qs = qs.filter(Q(vendor__external_vendor_id=vendor_id) | Q(vendor__name__icontains=vendor_id))

        if machine_id and machine_id.upper() != 'ALL':
            if machine_id.isdigit():
                qs = qs.filter(machine_id=int(machine_id))
            else:
                qs = qs.filter(Q(machine__code__iexact=machine_id) | Q(machine__name__icontains=machine_id))

        if task_id and task_id.upper() != 'ALL':
            if task_id.isdigit():
                qs = qs.filter(task_id=int(task_id))

        if status_param and status_param.upper() != 'ALL':
            qs = qs.filter(status__iexact=status_param)

        if payment_mode and payment_mode.upper() != 'ALL':
            qs = qs.filter(payment_mode__iexact=payment_mode)

        if date_from:
            try:
                dt_f = datetime.strptime(date_from, '%Y-%m-%d').date()
                qs = qs.filter(expense_date__gte=dt_f)
            except ValueError:
                pass

        if date_to:
            try:
                dt_t = datetime.strptime(date_to, '%Y-%m-%d').date()
                qs = qs.filter(expense_date__lte=dt_t)
            except ValueError:
                pass

        return qs.order_by('-expense_date', '-id')

    def perform_create(self, serializer):
        serializer.save(created_by=self.request.user)

    def perform_update(self, serializer):
        instance = serializer.instance
        if instance.status in ['APPROVED', 'PAID'] and not (self.request.user.is_superuser or 'ADMIN' in self.request.user.get_role_list()):
            raise permissions.PermissionDenied("Approved or Paid expenses cannot be edited by non-admin users.")
        serializer.save()

    def destroy(self, request, *args, **kwargs):
        instance = self.get_object()
        if instance.status in ['APPROVED', 'PAID'] and not (request.user.is_superuser or 'ADMIN' in request.user.get_role_list()):
            return error_response(message="Approved or Paid expenses cannot be deleted.", status_code=status.HTTP_403_FORBIDDEN)
        return super().destroy(request, *args, **kwargs)

    @action(detail=True, methods=['post'])
    def submit(self, request, pk=None):
        expense = self.get_object()
        if expense.status not in ['DRAFT', 'REJECTED']:
            return error_response(message=f"Cannot submit expense in status '{expense.status}'.")

        expense.status = 'SUBMITTED'
        expense.submitted_at = timezone.now()
        expense.save()
        return success_response(data=ExpenseSerializer(expense, context={'request': request}).data, message="Expense submitted successfully for approval.")

    @action(detail=True, methods=['post'])
    def approve(self, request, pk=None):
        user = request.user
        roles = [r.upper() for r in user.get_role_list()]
        user_perms = user.get_permission_codes()
        is_approver = user.is_superuser or 'ADMIN' in roles or 'PROJECT_MANAGER' in roles or 'MANAGER' in roles or 'expenses.approve' in user_perms

        if not is_approver:
            return error_response(message="You do not have permission to approve expenses.", status_code=status.HTTP_403_FORBIDDEN)

        expense = self.get_object()
        if expense.status not in ['SUBMITTED', 'DRAFT']:
            return error_response(message=f"Cannot approve expense in status '{expense.status}'.")

        expense.status = 'APPROVED'
        expense.approved_by = user
        expense.approved_at = timezone.now()
        expense.rejected_by = None
        expense.rejected_at = None
        expense.rejection_reason = None
        expense.save()
        return success_response(data=ExpenseSerializer(expense, context={'request': request}).data, message="Expense approved successfully.")

    @action(detail=True, methods=['post'])
    def reject(self, request, pk=None):
        user = request.user
        roles = [r.upper() for r in user.get_role_list()]
        user_perms = user.get_permission_codes()
        is_approver = user.is_superuser or 'ADMIN' in roles or 'PROJECT_MANAGER' in roles or 'MANAGER' in roles or 'expenses.reject' in user_perms

        if not is_approver:
            return error_response(message="You do not have permission to reject expenses.", status_code=status.HTTP_403_FORBIDDEN)

        expense = self.get_object()
        if expense.status not in ['SUBMITTED', 'DRAFT']:
            return error_response(message=f"Cannot reject expense in status '{expense.status}'.")

        reason = request.data.get('reason', '').strip() or request.data.get('rejection_reason', '').strip()

        expense.status = 'REJECTED'
        expense.rejected_by = user
        expense.rejected_at = timezone.now()
        expense.rejection_reason = reason
        expense.save()
        return success_response(data=ExpenseSerializer(expense, context={'request': request}).data, message="Expense rejected.")

    @action(detail=True, methods=['post'])
    def pay(self, request, pk=None):
        user = request.user
        roles = [r.upper() for r in user.get_role_list()]
        user_perms = user.get_permission_codes()
        is_finance = user.is_superuser or 'ADMIN' in roles or 'FINANCE' in roles or 'expenses.pay' in user_perms

        if not is_finance:
            return error_response(message="You do not have permission to mark expenses as paid.", status_code=status.HTTP_403_FORBIDDEN)

        expense = self.get_object()
        if expense.status != 'APPROVED':
            return error_response(message="Only APPROVED expenses can be marked as PAID.")

        payment_mode = request.data.get('payment_mode')
        payment_reference = request.data.get('payment_reference')

        if payment_mode:
            expense.payment_mode = payment_mode
        if payment_reference:
            expense.payment_reference = payment_reference

        expense.status = 'PAID'
        expense.paid_by = user
        expense.paid_at = timezone.now()
        if not expense.payment_date:
            expense.payment_date = timezone.now().date()
        expense.save()
        return success_response(data=ExpenseSerializer(expense, context={'request': request}).data, message="Expense marked as PAID.")

    @action(detail=False, methods=['post'], url_path='generate-monthly')
    def generate_monthly_expenses(self, request):
        user = request.user
        allowed_vendor_ids = get_user_vendor_ids(user)
        req_vendor = request.data.get('vendor_id') or request.data.get('vendor')
        
        target_vendor = None
        if req_vendor:
            from apps.vendors.models import Vendor
            v_str = str(req_vendor).strip()
            if v_str.isdigit():
                target_vendor = Vendor.objects.filter(id=int(v_str)).first()
            if not target_vendor:
                target_vendor = Vendor.objects.filter(Q(external_vendor_id=v_str) | Q(name__icontains=v_str)).first()
        elif allowed_vendor_ids and len(allowed_vendor_ids) > 0:
            from apps.vendors.models import Vendor
            target_vendor = Vendor.objects.filter(id=allowed_vendor_ids[0]).first()
        elif hasattr(user, 'vendor') and user.vendor:
            target_vendor = user.vendor

        now = timezone.now().date()
        year = int(request.data.get('year', now.year))
        month = int(request.data.get('month', now.month))
        exp_date = datetime(year, month, 1).date()

        fixed_categories = ExpenseCategory.objects.filter(
            is_active=True,
            payment_type='FIXED_MONTHLY',
            default_quantity__isnull=False,
            default_rate__isnull=False
        )

        generated = []
        skipped = 0

        for cat in fixed_categories:
            if cat.monthly_cost is None or cat.monthly_cost <= Decimal('0.00'):
                continue

            existing = Expense.objects.filter(
                category_ref=cat,
                expense_date__year=year,
                expense_date__month=month
            )
            if target_vendor:
                existing = existing.filter(vendor=target_vendor)
            else:
                existing = existing.filter(vendor__isnull=True)

            if existing.exists():
                skipped += 1
                continue

            exp = Expense(
                title=cat.name,
                category=cat.name,
                category_ref=cat,
                vendor=target_vendor,
                quantity=cat.default_quantity,
                unit=cat.uom or 'NOS',
                rate=cat.default_rate,
                basic_amount=cat.monthly_cost,
                total_amount=cat.monthly_cost,
                amount=cat.monthly_cost,
                payment_mode='FIXED_MONTHLY',
                payment_type='FIXED_MONTHLY',
                requires_proof=cat.requires_proof,
                expense_date=exp_date,
                status='APPROVED',
                created_by=user,
                approved_by=user,
                approved_at=timezone.now()
            )
            exp.save()
            generated.append(exp)

        total_gen_amount = sum(e.total_amount for e in generated)
        return success_response(
            data={
                "generated_count": len(generated),
                "skipped_count": skipped,
                "total_monthly_amount": float(total_gen_amount),
                "year": year,
                "month": month,
                "expenses": ExpenseSerializer(generated, many=True, context={'request': request}).data
            },
            message=f"Generated {len(generated)} fixed monthly expenses for {month}/{year} (Skipped {skipped} duplicates)."
        )

    @action(detail=False, methods=['get'])
    def dashboard_stats(self, request):
        qs = self.get_queryset()

        now = timezone.now().date()
        today_qs = qs.filter(expense_date=now)
        month_qs = qs.filter(expense_date__year=now.year, expense_date__month=now.month)

        total_count = qs.count()
        total_amount = qs.aggregate(s=Sum('total_amount'))['s'] or Decimal('0.00')

        today_amount = today_qs.aggregate(s=Sum('total_amount'))['s'] or Decimal('0.00')
        month_amount = month_qs.aggregate(s=Sum('total_amount'))['s'] or Decimal('0.00')

        submitted_qs = qs.filter(status='SUBMITTED')
        approved_qs = qs.filter(status='APPROVED')
        rejected_qs = qs.filter(status='REJECTED')
        paid_qs = qs.filter(status='PAID')
        draft_qs = qs.filter(status='DRAFT')

        fixed_monthly_qs = qs.filter(Q(payment_type='FIXED_MONTHLY') | Q(category_ref__payment_type='FIXED_MONTHLY'))
        actual_proof_qs = qs.filter(Q(payment_type='ACTUAL_WITH_PROOF') | Q(category_ref__payment_type='ACTUAL_WITH_PROOF'))

        fixed_monthly_amount = fixed_monthly_qs.aggregate(s=Sum('total_amount'))['s'] or Decimal('0.00')
        actual_proof_amount = actual_proof_qs.aggregate(s=Sum('total_amount'))['s'] or Decimal('0.00')

        by_category_raw = qs.values('category').annotate(amount=Sum('total_amount'), count=Count('id')).order_by('-amount')
        by_category = [{"category": item['category'] or 'Miscellaneous', "amount": float(item['amount'] or 0), "count": item['count']} for item in by_category_raw]

        by_vendor_raw = qs.values('vendor__name').annotate(amount=Sum('total_amount'), count=Count('id')).order_by('-amount')
        by_vendor = [{"vendor": item['vendor__name'] or 'Direct / General', "amount": float(item['amount'] or 0), "count": item['count']} for item in by_vendor_raw]

        by_machine_raw = qs.filter(machine__isnull=False).values('machine__name', 'machine__code').annotate(amount=Sum('total_amount'), count=Count('id')).order_by('-amount')[:10]
        by_machine = [{"machine": f"{item['machine__name']} ({item['machine__code']})", "amount": float(item['amount'] or 0), "count": item['count']} for item in by_machine_raw]

        stats_data = {
            "total_count": total_count,
            "total_amount": float(total_amount),
            "today_amount": float(today_amount),
            "month_amount": float(month_amount),
            "draft_count": draft_qs.count(),
            "draft_amount": float(draft_qs.aggregate(s=Sum('total_amount'))['s'] or 0),
            "submitted_count": submitted_qs.count(),
            "submitted_amount": float(submitted_qs.aggregate(s=Sum('total_amount'))['s'] or 0),
            "approved_count": approved_qs.count(),
            "approved_amount": float(approved_qs.aggregate(s=Sum('total_amount'))['s'] or 0),
            "rejected_count": rejected_qs.count(),
            "rejected_amount": float(rejected_qs.aggregate(s=Sum('total_amount'))['s'] or 0),
            "paid_count": paid_qs.count(),
            "paid_amount": float(paid_qs.aggregate(s=Sum('total_amount'))['s'] or 0),
            "fixed_monthly_count": fixed_monthly_qs.count(),
            "fixed_monthly_amount": float(fixed_monthly_amount),
            "actual_with_proof_count": actual_proof_qs.count(),
            "actual_with_proof_amount": float(actual_proof_amount),
            "by_category": by_category,
            "by_vendor": by_vendor,
            "by_machine": by_machine,
        }
        return success_response(data=stats_data, message="Expense dashboard statistics retrieved successfully.")

    @action(detail=False, methods=['get'])
    def export(self, request):
        qs = self.get_queryset()

        response = HttpResponse(content_type='text/csv')
        response['Content-Disposition'] = f'attachment; filename="hero_expenses_export_{timezone.now().strftime("%Y%m%d_%H%M%S")}.csv"'

        writer = csv.writer(response)
        writer.writerow([
            'Expense ID', 'Date', 'Category', 'Subcategory', 'Payment Type', 'Vendor',
            'Site', 'Task', 'Machine', 'Title', 'Description',
            'Quantity', 'Unit', 'Rate', 'Basic Amount', 'Discount',
            'GST Applicable', 'GST %', 'GST Amount', 'Total Amount',
            'Supplier', 'Invoice Number', 'Payment Mode', 'Payment Ref',
            'Status', 'Created By', 'Approved By'
        ])

        for exp in qs:
            writer.writerow([
                exp.expense_id or exp.id,
                exp.expense_date,
                exp.category_ref.name if exp.category_ref else exp.category,
                exp.subcategory_ref.name if exp.subcategory_ref else (exp.subcategory or ''),
                exp.payment_type or (exp.category_ref.payment_type if exp.category_ref else 'FIXED_MONTHLY'),
                exp.vendor.name if exp.vendor else '',
                exp.site or '',
                exp.task.title if exp.task else '',
                exp.machine.name if exp.machine else '',
                exp.title,
                exp.description or '',
                exp.quantity,
                exp.unit or 'NOS',
                exp.rate,
                exp.basic_amount,
                exp.discount,
                'YES' if exp.gst_applicable else 'NO',
                exp.gst_percentage,
                exp.gst_amount,
                exp.total_amount,
                exp.supplier_name or '',
                exp.invoice_number or '',
                exp.payment_mode or '',
                exp.payment_reference or '',
                exp.status,
                exp.created_by.get_full_name() if exp.created_by else '',
                exp.approved_by.get_full_name() if exp.approved_by else ''
            ])

        return response
