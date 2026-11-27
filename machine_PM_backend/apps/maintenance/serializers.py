from rest_framework import serializers

from apps.maintenance.models import (
    ChecklistCustomFieldConfig,
    ChecklistFrequencyMapping,
    ChecklistLocationRequirement,
    ChecklistPhotoRequirement,
    ChecklistVideoRequirement,
    MaintenanceApprovalReview,
    MaintenanceAuditLog,
    MaintenanceCategoryMaster,
    MaintenanceChecklistMaster,
    MaintenanceChecklistResponse,
    MaintenanceFrequencyMaster,
    MaintenanceLocationAttachment,
    MaintenancePhotoAttachment,
    MaintenanceSection,
    MaintenanceSubmission,
    MaintenanceVideoAttachment,
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

    def validate(self, attrs):
        is_active = attrs.get('is_active', getattr(self.instance, 'is_active', True))
        checklist_item = attrs.get('checklist_item', getattr(self.instance, 'checklist_item', None))
        if is_active and checklist_item is not None:
            qs = ChecklistFrequencyMapping.objects.filter(checklist_item=checklist_item, is_active=True)
            if self.instance is not None:
                qs = qs.exclude(pk=self.instance.pk)
            if qs.exists():
                raise serializers.ValidationError(
                    {"frequency": "Only one active frequency can be configured per maintenance activity."}
                )
        return attrs


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
            'is_as_required', 'sort_order', 'is_active', 'config_version', 'mapped_frequencies',
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


class MaintenanceSectionSerializer(serializers.ModelSerializer):
    checklist_item_code = serializers.CharField(source='checklist_item.item_code', read_only=True)

    class Meta:
        model = MaintenanceSection
        fields = [
            'id', 'checklist_item', 'checklist_item_code',
            'section_name', 'section_description', 'display_order', 'is_active',
            'created_at', 'updated_at',
        ]


class ChecklistCustomFieldConfigSerializer(serializers.ModelSerializer):
    category_code = serializers.CharField(source='checklist_item.category.code', read_only=True)
    category_name = serializers.CharField(source='checklist_item.category.name', read_only=True)
    checklist_item_code = serializers.CharField(source='checklist_item.item_code', read_only=True)
    checklist_description = serializers.CharField(source='checklist_item.description', read_only=True)
    section_name = serializers.CharField(source='section.section_name', read_only=True, allow_null=True)
    section_display_order = serializers.IntegerField(source='section.display_order', read_only=True, allow_null=True)
    frequency_code = serializers.CharField(source='frequency.code', read_only=True, allow_null=True)
    frequency_name = serializers.CharField(source='frequency.name', read_only=True, allow_null=True)

    class Meta:
        model = ChecklistCustomFieldConfig
        fields = [
            'id', 'category', 'category_code', 'category_name',
            'checklist_item', 'checklist_item_code', 'checklist_description',
            'section', 'section_name', 'section_display_order',
            'frequency', 'frequency_code', 'frequency_name',
            'field_name', 'field_label', 'field_description', 'field_type',
            'options', 'is_mandatory', 'condition_mode', 'condition_logic', 'condition_rules',
            'display_order', 'is_active', 'created_at', 'updated_at',
        ]


class ChecklistPhotoRequirementSerializer(serializers.ModelSerializer):
    category_code = serializers.CharField(source='checklist_item.category.code', read_only=True)
    category_name = serializers.CharField(source='checklist_item.category.name', read_only=True)
    checklist_item_code = serializers.CharField(source='checklist_item.item_code', read_only=True)
    checklist_description = serializers.CharField(source='checklist_item.description', read_only=True)
    frequency_code = serializers.CharField(source='frequency.code', read_only=True, allow_null=True)
    frequency_name = serializers.CharField(source='frequency.name', read_only=True, allow_null=True)

    class Meta:
        model = ChecklistPhotoRequirement
        fields = [
            'id', 'category', 'category_code', 'category_name',
            'checklist_item', 'checklist_item_code', 'checklist_description',
            'frequency', 'frequency_code', 'frequency_name',
            'photo_name', 'photo_description', 'is_required', 'is_mandatory',
            'condition_mode', 'condition_logic', 'condition_rules',
            'display_order', 'is_active', 'created_at', 'updated_at',
        ]


class ChecklistVideoRequirementSerializer(serializers.ModelSerializer):
    category_code = serializers.CharField(source='checklist_item.category.code', read_only=True)
    category_name = serializers.CharField(source='checklist_item.category.name', read_only=True)
    checklist_item_code = serializers.CharField(source='checklist_item.item_code', read_only=True)
    checklist_description = serializers.CharField(source='checklist_item.description', read_only=True)
    frequency_code = serializers.CharField(source='frequency.code', read_only=True, allow_null=True)
    frequency_name = serializers.CharField(source='frequency.name', read_only=True, allow_null=True)

    class Meta:
        model = ChecklistVideoRequirement
        fields = [
            'id', 'category', 'category_code', 'category_name',
            'checklist_item', 'checklist_item_code', 'checklist_description',
            'frequency', 'frequency_code', 'frequency_name',
            'video_name', 'video_description', 'is_required', 'is_mandatory',
            'min_videos', 'max_videos', 'max_duration_seconds',
            'condition_mode', 'condition_logic', 'condition_rules',
            'display_order', 'is_active', 'created_at', 'updated_at',
        ]


class MaintenancePhotoAttachmentSerializer(serializers.ModelSerializer):
    uploaded_by_name = serializers.SerializerMethodField()
    checklist_description = serializers.CharField(source='checklist_item.description', read_only=True)
    checklist_item_code = serializers.CharField(source='checklist_item.item_code', read_only=True)
    machine_number = serializers.SerializerMethodField()
    view_url = serializers.SerializerMethodField()
    checklist_response_id = serializers.IntegerField(source='response_id', read_only=True)
    user_id = serializers.IntegerField(source='uploaded_by_id', read_only=True)
    photo_filename = serializers.CharField(source='original_filename', read_only=True)
    mime_type = serializers.CharField(source='content_type', read_only=True)
    image_hash = serializers.CharField(source='sha256_hash', read_only=True)

    class Meta:
        model = MaintenancePhotoAttachment
        fields = [
            'id', 'submission_id', 'response_id', 'checklist_response_id',
            'photo_requirement_id', 'question_id', 'requirement_name', 'requirement_description', 'is_mandatory_snapshot',
            'machine_id', 'machine_number',
            'checklist_item_id', 'checklist_item_code', 'checklist_description',
            'uploaded_by_id', 'user_id', 'uploaded_by_name', 'frequency_code',
            'original_filename', 'photo_filename', 'content_type', 'mime_type',
            'file_size', 'sha256_hash', 'image_hash',
            'capture_source', 'is_bound', 'captured_at', 'latitude', 'longitude', 'accuracy_meters', 'view_url', 'created_at',
        ]

    def get_uploaded_by_name(self, obj):
        if obj.submission and obj.submission.submitted_by_name:
            return obj.submission.submitted_by_name
        from apps.hero_integration.models import HeroUser
        user = HeroUser.objects.filter(id=obj.uploaded_by_id).first()
        return user.get_display_name() if user else ''

    def get_machine_number(self, obj):
        if obj.submission and obj.submission.machine_number:
            return obj.submission.machine_number
        from apps.hero_integration.models import HeroMachine
        machine = HeroMachine.objects.filter(id=obj.machine_id).first()
        if machine:
            return machine.machine_chassis_no or machine.code or machine.serial_number
        return ''

    def get_view_url(self, obj):
        return f"/api/v1/machine-maintenance/photos/{obj.id}"


class MaintenanceVideoAttachmentSerializer(serializers.ModelSerializer):
    checklist_description = serializers.CharField(source='checklist_item.description', read_only=True)
    checklist_item_code = serializers.CharField(source='checklist_item.item_code', read_only=True)
    view_url = serializers.SerializerMethodField()
    checklist_response_id = serializers.IntegerField(source='response_id', read_only=True)
    user_id = serializers.IntegerField(source='uploaded_by_id', read_only=True)
    video_filename = serializers.CharField(source='original_filename', read_only=True)
    mime_type = serializers.CharField(source='content_type', read_only=True)
    video_hash = serializers.CharField(source='sha256_hash', read_only=True)

    class Meta:
        model = MaintenanceVideoAttachment
        fields = [
            'id', 'submission_id', 'response_id', 'checklist_response_id',
            'video_requirement_id', 'question_id', 'requirement_name', 'requirement_description', 'is_mandatory_snapshot',
            'machine_id',
            'checklist_item_id', 'checklist_item_code', 'checklist_description',
            'uploaded_by_id', 'user_id', 'frequency_code',
            'original_filename', 'video_filename', 'content_type', 'mime_type',
            'file_size', 'duration_seconds', 'sha256_hash', 'video_hash',
            'capture_source', 'is_bound', 'captured_at', 'latitude', 'longitude', 'accuracy_meters', 'view_url', 'created_at',
        ]

    def get_view_url(self, obj):
        return f"/api/v1/machine-maintenance/videos/{obj.id}"


class MaintenanceLocationAttachmentSerializer(serializers.ModelSerializer):
    checklist_response_id = serializers.IntegerField(source='response_id', read_only=True)
    user_id = serializers.IntegerField(source='captured_by_id', read_only=True)

    class Meta:
        model = MaintenanceLocationAttachment
        fields = [
            'id', 'submission_id', 'response_id', 'checklist_response_id',
            'location_requirement_id', 'question_id', 'requirement_name', 'requirement_description',
            'capture_rule_snapshot', 'is_mandatory_snapshot',
            'machine_id', 'checklist_item_id', 'captured_by_id', 'user_id', 'frequency_code',
            'latitude', 'longitude', 'accuracy_meters', 'captured_at',
            'geofence_required_snapshot', 'geofence_type_snapshot', 'geofence_reference_name_snapshot',
            'geofence_radius_meters_snapshot', 'geofence_is_valid', 'geofence_distance_meters',
            'geofence_validation_message', 'created_at',
        ]


class MaintenanceChecklistResponseSerializer(serializers.ModelSerializer):
    photo = serializers.SerializerMethodField()
    photo_id = serializers.SerializerMethodField()
    photo_url = serializers.SerializerMethodField()
    photo_hash = serializers.SerializerMethodField()
    captured_at = serializers.SerializerMethodField()
    photos = serializers.SerializerMethodField()
    videos = serializers.SerializerMethodField()
    locations = serializers.SerializerMethodField()
    remarks_hint = serializers.CharField(source='checklist_item.remarks', read_only=True)
    service_interval = serializers.CharField(source='checklist_item.service_interval', read_only=True)
    category_code = serializers.CharField(source='checklist_item.category.code', read_only=True)

    class Meta:
        model = MaintenanceChecklistResponse
        fields = [
            'id', 'checklist_item_id', 'item_code', 'category_code', 'category_name',
            'description_snapshot', 'status', 'remarks', 'custom_field_values',
            'config_version_snapshot', 'sections_snapshot', 'questions_snapshot',
            'photo_requirements_snapshot', 'video_requirements_snapshot', 'location_requirements_snapshot',
            'remarks_hint', 'service_interval',
            'responded_by_id', 'responded_at', 'photo_id', 'photo_url', 'photo_hash',
            'captured_at', 'photo', 'photos', 'videos', 'locations',
        ]

    def _first_photo(self, obj):
        atts = list(obj.photo_attachments.all())
        return atts[0] if atts else None

    def get_photo(self, obj):
        att = self._first_photo(obj)
        return MaintenancePhotoAttachmentSerializer(att).data if att else None

    def get_photo_id(self, obj):
        att = self._first_photo(obj)
        return att.id if att else None

    def get_photo_url(self, obj):
        att = self._first_photo(obj)
        return f"/api/v1/machine-maintenance/photos/{att.id}" if att else None

    def get_photo_hash(self, obj):
        att = self._first_photo(obj)
        return att.sha256_hash if att else None

    def get_captured_at(self, obj):
        att = self._first_photo(obj)
        return att.captured_at.isoformat() if (att and att.captured_at) else None

    def get_photos(self, obj):
        return MaintenancePhotoAttachmentSerializer(obj.photo_attachments.all(), many=True).data

    def get_videos(self, obj):
        return MaintenanceVideoAttachmentSerializer(obj.video_attachments.all(), many=True).data

    def get_locations(self, obj):
        return MaintenanceLocationAttachmentSerializer(obj.location_attachments.all(), many=True).data


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
    video_count = serializers.SerializerMethodField()
    location_count = serializers.SerializerMethodField()

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
            'photo_count', 'video_count', 'location_count', 'general_remarks',
            'submission_date', 'scheduled_due_date', 'completion_deadline_date', 'schedule_snapshot',
            'submitted_at', 'is_locked',
        ]

    def get_photo_count(self, obj):
        return obj.photos.count()

    def get_video_count(self, obj):
        return obj.videos.count()

    def get_location_count(self, obj):
        return obj.locations.count()


class MaintenanceSubmissionDetailSerializer(MaintenanceSubmissionListSerializer):
    responses = MaintenanceChecklistResponseSerializer(many=True, read_only=True)
    reviews = MaintenanceApprovalReviewSerializer(many=True, read_only=True)

    class Meta(MaintenanceSubmissionListSerializer.Meta):
        fields = MaintenanceSubmissionListSerializer.Meta.fields + [
            'machine_assignment_snapshot', 'submission_metadata', 'client_request_id',
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

