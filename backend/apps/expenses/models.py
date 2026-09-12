from django.db import models
from decimal import Decimal
from apps.vendors.models import Vendor
from apps.machines.models import Machine
from apps.tasks.models import Task
from apps.authentication.models import User

class ExpenseCategory(models.Model):
    name = models.CharField(max_length=150, unique=True)
    code = models.CharField(max_length=100, unique=True)
    order = models.IntegerField(default=0)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['order', 'name']

    def __str__(self):
        return self.name

class ExpenseSubCategory(models.Model):
    category = models.ForeignKey(ExpenseCategory, on_delete=models.CASCADE, related_name='subcategories')
    name = models.CharField(max_length=150)
    code = models.CharField(max_length=100)
    order = models.IntegerField(default=0)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['order', 'name']
        unique_together = ('category', 'name')

    def __str__(self):
        return f"{self.category.name} -> {self.name}"

class Expense(models.Model):
    expense_id = models.CharField(max_length=50, unique=True, null=True, blank=True)

    # Scoping / Relations
    vendor = models.ForeignKey(Vendor, on_delete=models.CASCADE, related_name='expenses', null=True, blank=True)
    machine = models.ForeignKey(Machine, on_delete=models.SET_NULL, null=True, blank=True, related_name='expenses')
    task = models.ForeignKey(Task, on_delete=models.SET_NULL, null=True, blank=True, related_name='expenses')
    operator = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True, related_name='operator_expenses')

    # Categories
    category = models.CharField(max_length=100, default='MISCELLANEOUS')
    subcategory = models.CharField(max_length=100, blank=True, null=True)
    category_ref = models.ForeignKey(ExpenseCategory, on_delete=models.SET_NULL, null=True, blank=True, related_name='expenses')
    subcategory_ref = models.ForeignKey(ExpenseSubCategory, on_delete=models.SET_NULL, null=True, blank=True, related_name='expenses')

    # Details
    title = models.CharField(max_length=255)
    description = models.TextField(blank=True, null=True)
    project = models.CharField(max_length=255, blank=True, null=True)
    site = models.CharField(max_length=255, blank=True, null=True)
    expense_date = models.DateField()

    # Amounts & Taxes
    quantity = models.DecimalField(max_digits=12, decimal_places=2, default=Decimal('1.00'))
    unit = models.CharField(max_length=50, default='NOS', blank=True, null=True)
    rate = models.DecimalField(max_digits=12, decimal_places=2, default=Decimal('0.00'))
    basic_amount = models.DecimalField(max_digits=12, decimal_places=2, default=Decimal('0.00'))
    discount = models.DecimalField(max_digits=12, decimal_places=2, default=Decimal('0.00'))
    taxable_amount = models.DecimalField(max_digits=12, decimal_places=2, default=Decimal('0.00'))
    gst_applicable = models.BooleanField(default=False)
    gst_percentage = models.DecimalField(max_digits=5, decimal_places=2, default=Decimal('0.00'))
    gst_amount = models.DecimalField(max_digits=12, decimal_places=2, default=Decimal('0.00'))
    total_amount = models.DecimalField(max_digits=12, decimal_places=2, default=Decimal('0.00'))
    amount = models.DecimalField(max_digits=12, decimal_places=2, default=Decimal('0.00'))

    # Supplier & Invoicing
    supplier_name = models.CharField(max_length=255, blank=True, null=True)
    invoice_number = models.CharField(max_length=100, blank=True, null=True)
    invoice_date = models.DateField(null=True, blank=True)

    # Payment
    payment_mode = models.CharField(max_length=50, default='CASH', blank=True, null=True)
    payment_reference = models.CharField(max_length=100, blank=True, null=True)
    payment_date = models.DateField(null=True, blank=True)

    # Approval Workflow
    status = models.CharField(max_length=50, default='DRAFT') # DRAFT, SUBMITTED, APPROVED, REJECTED, PAID
    created_by = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True, related_name='created_expenses')
    submitted_at = models.DateTimeField(null=True, blank=True)
    approved_by = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True, related_name='approved_expenses')
    approved_at = models.DateTimeField(null=True, blank=True)
    rejected_by = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True, related_name='rejected_expenses')
    rejected_at = models.DateTimeField(null=True, blank=True)
    rejection_reason = models.TextField(blank=True, null=True)
    paid_by = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True, related_name='paid_expenses')
    paid_at = models.DateTimeField(null=True, blank=True)

    # Attachments & Metadata
    remarks = models.TextField(blank=True, null=True)
    receipt_url = models.URLField(blank=True, null=True)
    attachment = models.FileField(upload_to='expenses/attachments/', blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-expense_date', '-id']

    def __str__(self):
        return f"[{self.expense_id or self.id}] {self.title} - ₹{self.total_amount}"

    def calculate_amounts(self):
        qty = Decimal(str(self.quantity or 0))
        rt = Decimal(str(self.rate or 0))
        disc = Decimal(str(self.discount or 0))
        gst_pct = Decimal(str(self.gst_percentage or 0))

        basic = qty * rt
        taxable = max(Decimal('0.00'), basic - disc)
        if self.gst_applicable and gst_pct > 0:
            gst_amt = taxable * (gst_pct / Decimal('100.0'))
        else:
            gst_amt = Decimal('0.00')
        
        tot = taxable + gst_amt

        self.basic_amount = basic.quantize(Decimal('0.01'))
        self.taxable_amount = taxable.quantize(Decimal('0.01'))
        self.gst_amount = gst_amt.quantize(Decimal('0.01'))
        self.total_amount = tot.quantize(Decimal('0.01'))
        self.amount = self.total_amount

    def generate_expense_id(self):
        if not self.expense_id:
            import random
            from django.utils import timezone
            now_str = timezone.now().strftime('%Y%m%d')
            rand_suffix = f"{random.randint(1000, 9999)}"
            self.expense_id = f"EXP-{now_str}-{rand_suffix}"

    def save(self, *args, **kwargs):
        self.calculate_amounts()
        if not self.expense_id:
            self.generate_expense_id()
        super().save(*args, **kwargs)
