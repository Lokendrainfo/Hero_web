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

    class Meta:
        model = ExpenseCategory
        fields = ['id', 'name', 'code', 'order', 'is_active', 'subcategories']

class ExpenseSerializer(serializers.ModelSerializer):
    category_name = serializers.SerializerMethodField()
    subcategory_name = serializers.SerializerMethodField()
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
            'total_amount', 'amount', 'created_by', 'submitted_at',
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

        vendor = attrs.get('vendor') or (self.instance.vendor if self.instance else None)
        machine = attrs.get('machine') or (self.instance.machine if self.instance else None)
        task = attrs.get('task') or (self.instance.task if self.instance else None)

        if machine and vendor and machine.vendor_id and machine.vendor_id != vendor.id:
            raise serializers.ValidationError({"machine": f"Machine '{machine.name}' does not belong to the selected vendor."})

        if task and vendor and task.vendor_id and task.vendor_id != vendor.id:
            raise serializers.ValidationError({"task": f"Task '{task.title}' does not belong to the selected vendor."})

        return attrs
