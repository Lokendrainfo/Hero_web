from django.db import models
from decimal import Decimal
from apps.authentication.models import User

PAYMENT_TYPE_CHOICES = (
    ('FIXED_MONTHLY', 'Fixed Monthly'),
    ('ACTUAL_WITH_PROOF', 'Actuals / As per Proof'),
)


class ExpenseCategory(models.Model):
    name = models.CharField(max_length=150, unique=True)
    code = models.CharField(max_length=100, unique=True)
    order = models.IntegerField(default=0)

    payment_type = models.CharField(max_length=50, choices=PAYMENT_TYPE_CHOICES, default='FIXED_MONTHLY')
    uom = models.CharField(max_length=50, null=True, blank=True)
    default_quantity = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True)
    default_rate = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True)
    monthly_cost = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True)
    requires_proof = models.BooleanField(default=False)

    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['order', 'name']

    def calculate_monthly_cost(self):
        if self.default_quantity is not None and self.default_rate is not None:
            qty = Decimal(str(self.default_quantity))
            rate = Decimal(str(self.default_rate))
            self.monthly_cost = (qty * rate).quantize(Decimal('0.01'))
        else:
            self.monthly_cost = None

    def save(self, *args, **kwargs):
        self.calculate_monthly_cost()
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.name} ({self.get_payment_type_display()})"


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
    """HERO-owned expense. Vendor/machine/task are external string IDs only."""
    expense_id = models.CharField(max_length=50, unique=True, null=True, blank=True)

    external_vendor_id = models.CharField(max_length=100, null=True, blank=True, db_index=True)
    machine_chassis_no = models.CharField(max_length=100, null=True, blank=True, db_index=True)
    external_task_id = models.CharField(max_length=100, null=True, blank=True, db_index=True)
    operator = models.ForeignKey(
        User, on_delete=models.SET_NULL, null=True, blank=True, related_name='operator_expenses'
    )

    category = models.CharField(max_length=100, default='MISCELLANEOUS')
    subcategory = models.CharField(max_length=100, blank=True, null=True)
    category_ref = models.ForeignKey(
        ExpenseCategory, on_delete=models.SET_NULL, null=True, blank=True, related_name='expenses'
    )
    subcategory_ref = models.ForeignKey(
        ExpenseSubCategory, on_delete=models.SET_NULL, null=True, blank=True, related_name='expenses'
    )

    payment_type = models.CharField(
        max_length=50, choices=PAYMENT_TYPE_CHOICES, default='FIXED_MONTHLY', null=True, blank=True
    )
    requires_proof = models.BooleanField(default=False)

    title = models.CharField(max_length=255)
    description = models.TextField(blank=True, null=True)
    project = models.CharField(max_length=255, blank=True, null=True)
    site = models.CharField(max_length=255, blank=True, null=True)
    expense_date = models.DateField()

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

    supplier_name = models.CharField(max_length=255, blank=True, null=True)
    invoice_number = models.CharField(max_length=100, blank=True, null=True)
    invoice_date = models.DateField(null=True, blank=True)

    payment_mode = models.CharField(max_length=50, default='CASH', blank=True, null=True)
    payment_reference = models.CharField(max_length=100, blank=True, null=True)
    payment_date = models.DateField(null=True, blank=True)

    status = models.CharField(max_length=50, default='DRAFT')
    created_by = models.ForeignKey(
        User, on_delete=models.SET_NULL, null=True, blank=True, related_name='created_expenses'
    )
    submitted_at = models.DateTimeField(null=True, blank=True)
    approved_by = models.ForeignKey(
        User, on_delete=models.SET_NULL, null=True, blank=True, related_name='approved_expenses'
    )
    approved_at = models.DateTimeField(null=True, blank=True)
    rejected_by = models.ForeignKey(
        User, on_delete=models.SET_NULL, null=True, blank=True, related_name='rejected_expenses'
    )
    rejected_at = models.DateTimeField(null=True, blank=True)
    rejection_reason = models.TextField(blank=True, null=True)
    paid_by = models.ForeignKey(
        User, on_delete=models.SET_NULL, null=True, blank=True, related_name='paid_expenses'
    )
    paid_at = models.DateTimeField(null=True, blank=True)

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
        qty = Decimal(str(self.quantity or 1))
        rt = Decimal(str(self.rate or 0))
        disc = Decimal(str(self.discount or 0))
        gst_pct = Decimal(str(self.gst_percentage or 0))

        if rt == Decimal('0.00') and (self.total_amount or self.amount):
            given_tot = Decimal(str(self.total_amount or self.amount or 0))
            if given_tot > Decimal('0.00'):
                rt = given_tot / qty
                self.rate = rt

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
