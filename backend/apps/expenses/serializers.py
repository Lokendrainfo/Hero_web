from rest_framework import serializers
from decimal import Decimal
from .models import Expense, ExpenseCategory, ExpenseSubCategory
from apps.vendors.models import Vendor
from apps.machines.models import Machine
from apps.tasks.models import Task
from apps.authentication.models import User

class ExpenseSubCategorySerializer(serializers.ModelSerializer):
    category_name = serializers.CharField(source='category.name', read_only=True)

    class Meta:
        model = ExpenseSubCategory
        fields = ['id', 'category', 'category_name', 'name', 'code', 'order', 'is_active']


class ExpenseCategorySerializer(serializers.ModelSerializer):
    subcategories = ExpenseSubCategorySerializer(many=True, read_only=True)
    payment_type_display = serializers.CharField(source='get_payment_type_display', read_only=True)

    class Meta:
        model = ExpenseCategory
        fields = [
            'id', 'name', 'code', 'order', 'payment_type', 'payment_type_display',
            'uom', 'default_quantity', 'default_rate', 'monthly_cost',
            'requires_proof', 'is_active', 'subcategories'
        ]

    def validate_default_quantity(self, value):
        if value is not None and value < 0:
            raise serializers.ValidationError("Default quantity cannot be negative.")
        return value

    def validate_default_rate(self, value):
        if value is not None and value < 0:
            raise serializers.ValidationError("Default rate cannot be negative.")
        return value

class ExpenseSerializer(serializers.ModelSerializer):
    category_name = serializers.SerializerMethodField()
    subcategory_name = serializers.SerializerMethodField()
    payment_type_display = serializers.CharField(source='get_payment_type_display', read_only=True)
    vendor_name = serializers.CharField(source='vendor.name', read_only=True, allow_null=True)
    vendor_code = serializers.CharField(source='vendor.code', read_only=True, allow_null=True)
    machine_name = serializers.CharField(source='machine.name', read_only=True, allow_null=True)
    machine_code = serializers.CharField(source='machine.code', read_only=True, allow_null=True)
    task_title = serializers.CharField(source='task.title', read_only=True, allow_null=True)
    operator_name = serializers.SerializerMethodField()
    created_by_name = serializers.SerializerMethodField()
    approved_by_name = serializers.SerializerMethodField()
    rejected_by_name = serializers.SerializerMethodField()
    paid_by_name = serializers.SerializerMethodField()
    attachment_url = serializers.SerializerMethodField()

    vendor_id = serializers.CharField(required=False, allow_null=True, write_only=True)

    class Meta:
        model = Expense
        fields = '__all__'
        read_only_fields = [
            'expense_id', 'basic_amount', 'taxable_amount', 'gst_amount',
            'created_by', 'submitted_at',
            'approved_by', 'approved_at', 'rejected_by', 'rejected_at',
            'paid_by', 'paid_at', 'created_at', 'updated_at'
        ]

    def get_category_name(self, obj):
        if obj.category_ref:
            return obj.category_ref.name
        return obj.category or 'Miscellaneous'

    def get_subcategory_name(self, obj):
        if obj.subcategory_ref:
            return obj.subcategory_ref.name
        return obj.subcategory or ''

    def get_operator_name(self, obj):
        if obj.operator:
            return obj.operator.get_full_name() or obj.operator.username
        return None

    def get_created_by_name(self, obj):
        if obj.created_by:
            return obj.created_by.get_full_name() or obj.created_by.username
        return None

    def get_approved_by_name(self, obj):
        if obj.approved_by:
            return obj.approved_by.get_full_name() or obj.approved_by.username
        return None

    def get_rejected_by_name(self, obj):
        if obj.rejected_by:
            return obj.rejected_by.get_full_name() or obj.rejected_by.username
        return None

    def get_paid_by_name(self, obj):
        if obj.paid_by:
            return obj.paid_by.get_full_name() or obj.paid_by.username
        return None

    def get_attachment_url(self, obj):
        if obj.attachment:
            try:
                request = self.context.get('request')
                if request:
                    return request.build_absolute_uri(obj.attachment.url)
                return obj.attachment.url
            except Exception:
                return None
        return obj.receipt_url or None

    def validate_quantity(self, value):
        if value is not None and value <= 0:
            raise serializers.ValidationError("Quantity must be greater than 0.")
        return value

    def validate_rate(self, value):
        if value is not None and value < 0:
            raise serializers.ValidationError("Rate cannot be negative.")
        return value

    def validate_gst_percentage(self, value):
        if value is not None and (value < 0 or value > 100):
            raise serializers.ValidationError("GST percentage must be between 0 and 100.")
        return value

    def validate_discount(self, value):
        if value is not None and value < 0:
            raise serializers.ValidationError("Discount cannot be negative.")
        return value

    def validate(self, attrs):
        vendor_id = attrs.pop('vendor_id', None)
        if vendor_id is not None:
            from django.db.models import Q
            v_str = str(vendor_id).strip()
            if v_str in ('', '0', 'null', 'none'):
                attrs['vendor'] = None
            else:
                v_obj = Vendor.objects.filter(
                    Q(id=int(v_str) if v_str.isdigit() else None) |
                    Q(external_vendor_id=v_str) |
                    Q(code__iexact=v_str)
                ).first()
                if v_obj:
                    attrs['vendor'] = v_obj

        # Vendor scoping validation
        request = self.context.get('request')
        user = request.user if request else None
        if user and user.is_authenticated and not (user.is_superuser or 'ADMIN' in [r.upper() for r in user.get_role_list()]):
            from apps.common.vendor_scope import get_user_vendor_ids
            user_v_ids = get_user_vendor_ids(user)
            if user_v_ids is not None:
                provided_vendor = attrs.get('vendor')
                if not provided_vendor or provided_vendor.id not in user_v_ids:
                    from apps.vendors.models import Vendor
                    attrs['vendor'] = Vendor.objects.filter(id=user_v_ids[0]).first() if len(user_v_ids) > 0 else None

        vendor = attrs.get('vendor') or (self.instance.vendor if self.instance else None)
        machine = attrs.get('machine') or (self.instance.machine if self.instance else None)
        task = attrs.get('task') or (self.instance.task if self.instance else None)

        if machine and vendor and machine.vendor_id and machine.vendor_id != vendor.id:
            raise serializers.ValidationError({"machine": f"Machine '{machine.name}' does not belong to the selected vendor."})

        if task and vendor and task.vendor_id and task.vendor_id != vendor.id:
            raise serializers.ValidationError({"task": f"Task '{task.title}' does not belong to the selected vendor."})

        # Proof requirement validation
        cat_ref = attrs.get('category_ref') or (self.instance.category_ref if self.instance else None)
        if cat_ref and isinstance(cat_ref, int):
            cat_ref = ExpenseCategory.objects.filter(id=cat_ref).first()

        payment_type = attrs.get('payment_type') or (cat_ref.payment_type if cat_ref and hasattr(cat_ref, 'payment_type') else None)
        requires_proof = attrs.get('requires_proof', cat_ref.requires_proof if cat_ref and hasattr(cat_ref, 'requires_proof') else False)

        attachment = attrs.get('attachment') or (self.instance.attachment if self.instance else None)
        receipt_url = attrs.get('receipt_url') or (self.instance.receipt_url if self.instance else None)

        if (payment_type == 'ACTUAL_WITH_PROOF' or requires_proof) and not attachment and not receipt_url:
            raise serializers.ValidationError({"attachment": "Proof/bill/receipt attachment is required for this expense type."})

        return attrs
