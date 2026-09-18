from django.contrib import admin
from .models import ExpenseCategory, ExpenseSubCategory, Expense


class ExpenseSubCategoryInline(admin.TabularInline):
    model = ExpenseSubCategory
    extra = 0


@admin.register(ExpenseCategory)
class ExpenseCategoryAdmin(admin.ModelAdmin):
    list_display = ('order', 'name', 'code', 'payment_type', 'uom', 'monthly_cost', 'requires_proof', 'is_active')
    list_filter = ('payment_type', 'is_active', 'requires_proof')
    search_fields = ('name', 'code')
    ordering = ('order', 'name')
    inlines = (ExpenseSubCategoryInline,)
    readonly_fields = ('monthly_cost', 'created_at')


@admin.register(ExpenseSubCategory)
class ExpenseSubCategoryAdmin(admin.ModelAdmin):
    list_display = ('name', 'code', 'category', 'order', 'is_active')
    list_filter = ('is_active', 'category')
    search_fields = ('name', 'code', 'category__name')
    autocomplete_fields = ('category',)


@admin.register(Expense)
class ExpenseAdmin(admin.ModelAdmin):
    list_display = (
        'expense_id', 'title', 'external_vendor_id', 'category_ref', 'expense_date',
        'total_amount', 'status', 'created_by',
    )
    list_filter = ('status', 'payment_type', 'payment_mode', 'gst_applicable', 'expense_date')
    search_fields = (
        'expense_id', 'title', 'description', 'invoice_number',
        'supplier_name', 'project', 'site', 'external_vendor_id', 'machine_chassis_no',
    )
    autocomplete_fields = (
        'operator', 'category_ref', 'subcategory_ref',
        'created_by', 'approved_by', 'rejected_by', 'paid_by',
    )
    list_select_related = ('category_ref', 'created_by')
    date_hierarchy = 'expense_date'
    readonly_fields = (
        'expense_id', 'basic_amount', 'taxable_amount', 'gst_amount',
        'total_amount', 'amount', 'created_at', 'updated_at',
    )
    list_per_page = 50
    fieldsets = (
        ('Identity', {'fields': ('expense_id', 'title', 'description', 'expense_date', 'status')}),
        ('Scope', {
            'fields': (
                'external_vendor_id', 'machine_chassis_no', 'external_task_id',
                'operator', 'project', 'site',
            )
        }),
        ('Category', {
            'fields': (
                'category', 'subcategory', 'category_ref', 'subcategory_ref',
                'payment_type', 'requires_proof',
            )
        }),
        ('Amounts', {
            'fields': (
                'quantity', 'unit', 'rate', 'discount', 'gst_applicable', 'gst_percentage',
                'basic_amount', 'taxable_amount', 'gst_amount', 'total_amount', 'amount',
            )
        }),
        ('Supplier & payment', {
            'fields': (
                'supplier_name', 'invoice_number', 'invoice_date',
                'payment_mode', 'payment_reference', 'payment_date',
            )
        }),
        ('Workflow', {
            'fields': (
                'created_by', 'submitted_at', 'approved_by', 'approved_at',
                'rejected_by', 'rejected_at', 'rejection_reason', 'paid_by', 'paid_at',
            )
        }),
        ('Attachments', {'fields': ('remarks', 'receipt_url', 'attachment')}),
        ('Dates', {'fields': ('created_at', 'updated_at')}),
    )
