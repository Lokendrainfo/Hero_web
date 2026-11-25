from rest_framework import serializers

from apps.maintenance.models import (
    ChecklistFrequencyMapping,
    MaintenanceApprovalReview,
    MaintenanceAuditLog,
    MaintenanceCategoryMaster,
    MaintenanceChecklistMaster,
    MaintenanceChecklistResponse,
    MaintenanceFrequencyMaster,
    MaintenancePhotoAttachment,
    MaintenanceSubmission,
    RoleFrequencyMapping,
)


class MaintenanceFrequencyMasterSerializer(serializers.ModelSerializer):
    class Meta:
        model = MaintenanceFrequencyMaster
        fields = [
            'id', 'code', 'name', 'interval_hours', 'interval_days',
            'due_threshold_pct', 'description', 'sort_order', 'is_active',
            'created_at', 'updated_at',
        ]


class MaintenanceCategoryMasterSerializer(serializers.ModelSerializer):
    class Meta:
        model = MaintenanceCategoryMaster
        fields = [
            'id', 'code', 'name', 'description', 'is_checkable',
            'sort_order', 'is_active', 'created_at', 'updated_at',
        ]


class ChecklistFrequencyMappingSerializer(serializers.ModelSerializer):
    frequency_code = serializers.CharField(source='frequency.code', read_only=True)
    frequency_name = serializers.CharField(source='frequency.name', read_only=True)
    checklist_item_code = serializers.CharField(source='checklist_item.item_code', read_only=True)
    checklist_description = serializers.CharField(source='checklist_item.description', read_only=True)

    class Meta:
        model = ChecklistFrequencyMapping
        fields = [
            'id', 'checklist_item', 'checklist_item_code', 'checklist_description',
            'frequency', 'frequency_code', 'frequency_name',
            'is_mandatory', 'sort_order', 'is_active', 'created_at', 'updated_at',
        ]


class MaintenanceChecklistMasterSerializer(serializers.ModelSerializer):
    category_code = serializers.CharField(source='category.code', read_only=True)
    category_name = serializers.CharField(source='category.name', read_only=True)
    mapped_frequencies = serializers.SerializerMethodField()

    class Meta:
        model = MaintenanceChecklistMaster
        fields = [
            'id', 'item_code', 'category', 'category_code', 'category_name',
            'description', 'remarks', 'special_instructions', 'service_interval',
            'section_key', 'requires_photo', 'requires_remarks_if_not_completed',
            'is_as_required', 'sort_order', 'is_active', 'mapped_frequencies',
            'created_at', 'updated_at',
        ]

    def get_mapped_frequencies(self, obj):
        return list(
            obj.frequency_mappings.filter(is_active=True)
            .select_related('frequency')
            .order_by('frequency__sort_order')
            .values_list('frequency__code', flat=True)
        )


class RoleFrequencyMappingSerializer(serializers.ModelSerializer):
    frequency_code = serializers.CharField(source='frequency.code', read_only=True)
    frequency_name = serializers.CharField(source='frequency.name', read_only=True)

    class Meta:
        model = RoleFrequencyMapping
        fields = [
            'id', 'role_code', 'role_name', 'frequency', 'frequency_code',
            'frequency_name', 'can_view', 'can_submit', 'is_active',
            'created_at', 'updated_at',
        ]


class MaintenancePhotoAttachmentSerializer(serializers.ModelSerializer):
    uploaded_by_name = serializers.SerializerMethodField()
    checklist_description = serializers.CharField(source='checklist_item.description', read_only=True)
    checklist_item_code = serializers.CharField(source='checklist_item.item_code', read_only=True)
    machine_number = serializers.SerializerMethodField()
    view_url = serializers.SerializerMethodField()

    class Meta:
        model = MaintenancePhotoAttachment
        fields = [
            'id', 'submission_id', 'response_id', 'machine_id', 'machine_number',
            'checklist_item_id', 'checklist_item_code', 'checklist_description',
            'uploaded_by_id', 'uploaded_by_name', 'frequency_code',
            'original_filename', 'content_type', 'file_size', 'sha256_hash',
            'is_bound', 'captured_at', 'latitude', 'longitude', 'view_url', 'created_at',
        ]

    def get_uploaded_by_name(self, obj):
        return obj.uploaded_by.get_display_name() if obj.uploaded_by else ''

    def get_machine_number(self, obj):
        if obj.machine:
            return obj.machine.machine_chassis_no or obj.machine.code or obj.machine.serial_number
        return ''

    def get_view_url(self, obj):
        return f"/api/v1/pm/photos/{obj.id}/view/"


class MaintenanceChecklistResponseSerializer(serializers.ModelSerializer):
    photo = serializers.SerializerMethodField()
    photo_id = serializers.SerializerMethodField()
    photo_url = serializers.SerializerMethodField()
    photo_hash = serializers.SerializerMethodField()
    captured_at = serializers.SerializerMethodField()
    remarks_hint = serializers.CharField(source='checklist_item.remarks', read_only=True)
    service_interval = serializers.CharField(source='checklist_item.service_interval', read_only=True)
    category_code = serializers.CharField(source='checklist_item.category.code', read_only=True)

    class Meta:
        model = MaintenanceChecklistResponse
        fields = [
            'id', 'checklist_item_id', 'item_code', 'category_code', 'category_name',
            'description_snapshot', 'status', 'remarks', 'remarks_hint', 'service_interval',
            'responded_by_id', 'responded_at', 'photo_id', 'photo_url', 'photo_hash',
            'captured_at', 'photo',
        ]

    def get_photo(self, obj):
        att = getattr(obj, 'photo_attachment', None)
        if not att:
            return None
        return MaintenancePhotoAttachmentSerializer(att).data

    def get_photo_id(self, obj):
        att = getattr(obj, 'photo_attachment', None)
        return att.id if att else None

    def get_photo_url(self, obj):
        att = getattr(obj, 'photo_attachment', None)
        return f"/api/v1/pm/photos/{att.id}/view/" if att else None

    def get_photo_hash(self, obj):
        att = getattr(obj, 'photo_attachment', None)
        return att.sha256_hash if att else None

    def get_captured_at(self, obj):
        att = getattr(obj, 'photo_attachment', None)
        return att.captured_at.isoformat() if (att and att.captured_at) else None


class MaintenanceApprovalReviewSerializer(serializers.ModelSerializer):
    class Meta:
        model = MaintenanceApprovalReview
        fields = [
            'id', 'submission_id', 'reviewer_id', 'reviewer_name',
            'reviewer_role', 'action', 'previous_status', 'new_status',
            'remarks', 'reviewed_at',
        ]


class MaintenanceSubmissionListSerializer(serializers.ModelSerializer):
    frequency_code = serializers.CharField(source='frequency.code', read_only=True)
    frequency_name = serializers.CharField(source='frequency.name', read_only=True)
    photo_count = serializers.SerializerMethodField()

    class Meta:
        model = MaintenanceSubmission
        fields = [
            'id', 'submission_number', 'machine_id', 'machine_number',
            'machine_name', 'machine_model', 'machine_type',
            'vendor_id', 'vendor_name', 'assigned_operator',
            'frequency_code', 'frequency_name', 'hour_meter_reading',
            'submitted_by_id', 'submitted_by_name', 'submitted_by_role',
            'status', 'approval_status', 'total_items',
            'completed_items_count', 'not_completed_items_count',
            'photo_count', 'general_remarks', 'submission_date',
            'submitted_at', 'is_locked',
        ]

    def get_photo_count(self, obj):
        return obj.photos.count()


class MaintenanceSubmissionDetailSerializer(MaintenanceSubmissionListSerializer):
    responses = MaintenanceChecklistResponseSerializer(many=True, read_only=True)
    reviews = MaintenanceApprovalReviewSerializer(many=True, read_only=True)

    class Meta(MaintenanceSubmissionListSerializer.Meta):
        fields = MaintenanceSubmissionListSerializer.Meta.fields + [
            'machine_assignment_snapshot', 'client_request_id',
            'responses', 'reviews', 'created_at', 'updated_at',
        ]


class MaintenanceAuditLogSerializer(serializers.ModelSerializer):
    class Meta:
        model = MaintenanceAuditLog
        fields = [
            'id', 'entity_type', 'entity_id', 'action',
            'actor_id', 'actor_username', 'actor_role',
            'machine_id', 'frequency_code', 'details',
            'ip_address', 'created_at',
        ]

