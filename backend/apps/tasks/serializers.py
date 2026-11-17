from rest_framework import serializers
from django.utils import timezone
from .models import Task, Hindrance
from apps.vendors.models import Vendor

class TaskSerializer(serializers.ModelSerializer):
    class Meta:
        model = Task
        fields = '__all__'


# Controlled Classification Masters matching Java enums
HINDRANCE_TYPES = [
    {"value": "Linear", "label": "Linear"},
    {"value": "Architecture change Involved", "label": "Architecture change Involved"},
    {"value": "No", "label": "No"},
    {"value": "Ring to Linear", "label": "Ring to Linear"},
    {"value": "Linear to Ring", "label": "Linear to Ring"},
]

SUB_HINDRANCE_TYPES = {
    "Linear": [
        "Low Depth",
        "Route Divert",
        "New GP Add",
        "GP Shifting",
    ],
    "Architecture change Involved": [
        "Heavy congestion of underground utilities",
        "CC Road – Authority not allowing",
        "CC Road – OT/HDD is not feasible",
        "Permission issue from local authority",
        "Local objection on private land",
        "Narrow Road",
        "Hard Rock",
        "Public issue",
        "Permission restriction from the concerned authority",
        "Road Expansion",
        "Other Remarks (Open Text)",
    ],
    "No": [],
    "Ring to Linear": [],
    "Linear to Ring": [],
}


def normalize_survey_photo(val):
    """
    Normalizes a photo/video value into the standard SurveyPhoto structure:
    { key, url, fileName, fileSize, mimeType, captureTime, latitude, longitude }
    """
    if not val:
        return None
    if isinstance(val, dict):
        if not val.get('url') and val.get('key'):
            val['url'] = f"/media/{val['key']}"
        return val
    if isinstance(val, str):
        s = val.strip()
        if not s:
            return None
        return {
            "key": s,
            "url": s if s.startswith(('http://', 'https://', '/media/')) else f"/media/{s}",
            "fileName": s.split('/')[-1],
            "captureTime": None,
            "latitude": None,
            "longitude": None
        }
    return None


class HindranceSerializer(serializers.ModelSerializer):
    """
    Serializer strictly aligned with Java Model:
    com.netinfra.platform.task.dao.entities.survey.HindranceTaskData
    """
    hindrance_id = serializers.CharField(required=False, allow_blank=True)
    hindranceId = serializers.CharField(source='hindrance_id', required=False, allow_blank=True)
    created_by_name = serializers.SerializerMethodField()
    vendor_name = serializers.SerializerMethodField()

    # Aliases and Java fields
    surveyKind = serializers.SerializerMethodField()
    proposedHindrance = serializers.SerializerMethodField()
    approvedHindrance = serializers.SerializerMethodField()
    approvalHistory = serializers.SerializerMethodField()

    class Meta:
        model = Hindrance
        fields = '__all__'
        extra_kwargs = {
            'hindrance_id': {'required': False, 'allow_blank': True},
        }

    def get_surveyKind(self, obj):
        return "HINDRANCE"

    def get_created_by_name(self, obj):
        if obj.created_by:
            name = f"{obj.created_by.first_name} {obj.created_by.last_name}".strip()
            return name or obj.created_by.username
        return 'System'

    def get_vendor_name(self, obj):
        if obj.vendor:
            return obj.vendor.name
        return obj.contractor or '—'

    def get_proposedHindrance(self, obj):
        if isinstance(obj.proposed_hindrance, dict) and obj.proposed_hindrance:
            return obj.proposed_hindrance
        return obj.build_proposed_details()

    def get_approvedHindrance(self, obj):
        if isinstance(obj.approved_hindrance, dict) and obj.approved_hindrance:
            return obj.approved_hindrance
        return None

    def get_approvalHistory(self, obj):
        return obj.approval_history or []

    def to_internal_value(self, data):
        """
        Parses incoming payload supporting:
        - Canonical Java HindranceTaskData format (nested fieldData or proposedHindrance)
        - Aliases: hindranceId, hindrance_id, hindrenceId, hindrence_id, id
        - Coordinate aliases: sLatitude/startLatitude, sLongitude/startLongitude, etc.
        """
        mutable_data = data.copy() if hasattr(data, 'copy') else dict(data)

        # 1. Check for nested fieldData or proposedHindrance
        nested_field_data = mutable_data.get('fieldData') or {}
        proposed = mutable_data.get('proposedHindrance') or nested_field_data.get('proposedHindrance') or {}
        approved = mutable_data.get('approvedHindrance') or nested_field_data.get('approvedHindrance') or {}

        # 2. Extract canonical hindrance ID from any known alias
        h_id = (
            mutable_data.get('hindranceId') or
            mutable_data.get('hindrance_id') or
            mutable_data.get('hindrenceId') or
            mutable_data.get('hindrence_id') or
            mutable_data.get('id') or
            proposed.get('hindranceId') or
            proposed.get('hindrance_id') or
            nested_field_data.get('hindranceId')
        )
        if h_id:
            mutable_data['hindrance_id'] = str(h_id).strip()

        # 3. Hindrance Type and Sub-Type
        h_type = (
            mutable_data.get('hindranceType') or
            mutable_data.get('hindrance_type') or
            mutable_data.get('category') or
            proposed.get('hindranceType') or
            proposed.get('category') or
            'Linear'
        )
        sub_type = (
            mutable_data.get('subHindranceType') or
            mutable_data.get('sub_hindrance_type') or
            mutable_data.get('sub_category') or
            proposed.get('subHindranceType') or
            ''
        )
        mutable_data['hindrance_type'] = h_type
        mutable_data['category'] = h_type
        mutable_data['sub_hindrance_type'] = sub_type
        mutable_data['sub_category'] = sub_type

        # 4. Description and Remarks
        desc = (
            mutable_data.get('description') or
            proposed.get('description') or
            ''
        )
        remarks = (
            mutable_data.get('remarks') or
            proposed.get('remarks') or
            nested_field_data.get('remarks') or
            ''
        )
        mutable_data['description'] = desc
        mutable_data['remarks'] = remarks

        # 5. Point Coordinates
        lat = mutable_data.get('latitude') or proposed.get('latitude')
        lng = mutable_data.get('longitude') or proposed.get('longitude')
        if lat is not None and lat != '':
            mutable_data['latitude'] = float(lat)
        if lng is not None and lng != '':
            mutable_data['longitude'] = float(lng)

        # 6. Stretch Coordinates (sLatitude / eLatitude and aliases)
        s_lat = (
            mutable_data.get('sLatitude') or
            mutable_data.get('s_latitude') or
            mutable_data.get('startLatitude') or
            mutable_data.get('slatitude') or
            proposed.get('sLatitude') or
            proposed.get('startLatitude')
        )
        s_lng = (
            mutable_data.get('sLongitude') or
            mutable_data.get('s_longitude') or
            mutable_data.get('startLongitude') or
            mutable_data.get('slongitude') or
            proposed.get('sLongitude') or
            proposed.get('startLongitude')
        )
        e_lat = (
            mutable_data.get('eLatitude') or
            mutable_data.get('e_latitude') or
            mutable_data.get('endLatitude') or
            mutable_data.get('elatitude') or
            proposed.get('eLatitude') or
            proposed.get('endLatitude')
        )
        e_lng = (
            mutable_data.get('eLongitude') or
            mutable_data.get('e_longitude') or
            mutable_data.get('endLongitude') or
            mutable_data.get('elongitude') or
            proposed.get('eLongitude') or
            proposed.get('endLongitude')
        )
        if s_lat is not None and s_lat != '':
            mutable_data['s_latitude'] = float(s_lat)
        if s_lng is not None and s_lng != '':
            mutable_data['s_longitude'] = float(s_lng)
        if e_lat is not None and e_lat != '':
            mutable_data['e_latitude'] = float(e_lat)
        if e_lng is not None and e_lng != '':
            mutable_data['e_longitude'] = float(e_lng)

        # 7. Media fields
        start_photo = normalize_survey_photo(mutable_data.get('startPhoto') or mutable_data.get('start_photo') or proposed.get('startPhoto'))
        end_photo = normalize_survey_photo(mutable_data.get('endPhoto') or mutable_data.get('end_photo') or proposed.get('endPhoto'))
        walkthrough_video = normalize_survey_photo(mutable_data.get('walkthroughVideo') or mutable_data.get('walkthrough_video') or proposed.get('walkthroughVideo'))
        photos_raw = mutable_data.get('photos') or proposed.get('photos') or []
        add_photos_raw = mutable_data.get('additionalPhotos') or mutable_data.get('additional_photos') or proposed.get('additionalPhotos') or []
        add_videos_raw = mutable_data.get('additionalVideos') or mutable_data.get('additional_videos') or proposed.get('additionalVideos') or []
        shp_raw = mutable_data.get('shpFiles') or mutable_data.get('shp_files') or proposed.get('shpFiles') or []

        mutable_data['start_photo'] = start_photo or {}
        mutable_data['end_photo'] = end_photo or {}
        mutable_data['walkthrough_video'] = walkthrough_video or {}

        # Normalize lists of media
        normalized_photos = []
        if isinstance(photos_raw, list):
            for p in photos_raw:
                norm = normalize_survey_photo(p)
                if norm:
                    normalized_photos.append(norm)
        # Ensure start and end photos are also included in photos[] per documentation
        if start_photo and start_photo not in normalized_photos:
            normalized_photos.insert(0, start_photo)
        if end_photo and end_photo not in normalized_photos:
            normalized_photos.append(end_photo)
        mutable_data['photos'] = normalized_photos

        normalized_add_photos = []
        if isinstance(add_photos_raw, list):
            for p in add_photos_raw:
                norm = normalize_survey_photo(p)
                if norm:
                    normalized_add_photos.append(norm)
        mutable_data['additional_photos'] = normalized_add_photos

        normalized_add_videos = []
        if isinstance(add_videos_raw, list):
            for v in add_videos_raw:
                norm = normalize_survey_photo(v)
                if norm:
                    normalized_add_videos.append(norm)
        mutable_data['additional_videos'] = normalized_add_videos

        mutable_data['shp_files'] = shp_raw if isinstance(shp_raw, list) else []

        # 8. Independent Engineer (IE) Fields
        ie_name = mutable_data.get('ieName') or mutable_data.get('ie_name') or proposed.get('ieName') or ''
        ie_phone = mutable_data.get('iePhoneNumber') or mutable_data.get('ie_phone_number') or proposed.get('iePhoneNumber') or ''
        ie_photo_needed = mutable_data.get('iePhotoNeeded')
        if ie_photo_needed is None:
            ie_photo_needed = mutable_data.get('ie_photo_needed')
        if ie_photo_needed is None:
            ie_photo_needed = proposed.get('iePhotoNeeded', False)

        ie_photo = normalize_survey_photo(mutable_data.get('iePhoto') or mutable_data.get('ie_photo') or proposed.get('iePhoto'))

        mutable_data['ie_name'] = ie_name
        mutable_data['ie_phone_number'] = ie_phone
        mutable_data['ie_photo_needed'] = bool(ie_photo_needed)
        mutable_data['ie_photo'] = ie_photo or {}

        # 9. Title default
        if not mutable_data.get('title'):
            mutable_data['title'] = f"{h_type}: {sub_type or 'Hindrance'}"

        # 10. Status handling
        target_status = mutable_data.get('status')
        if target_status:
            mutable_data['status'] = str(target_status).upper()

        return super().to_internal_value(mutable_data)

    def validate(self, attrs):
        """
        Validates classification hierarchy and IE photo requirements.
        """
        h_type = attrs.get('hindrance_type') or 'Linear'
        sub_type = attrs.get('sub_hindrance_type')
        status = attrs.get('status') or 'DRAFT'

        # Sub-Hindrance Type dynamic validation
        allowed_subtypes = SUB_HINDRANCE_TYPES.get(h_type, [])
        if allowed_subtypes and sub_type:
            # Check normalized match
            norm_sub = sub_type.replace('–', '-').replace('—', '-').strip().lower()
            matched = any(s.replace('–', '-').replace('—', '-').strip().lower() == norm_sub for s in allowed_subtypes)
            if not matched and sub_type != "Other Remarks (Open Text)":
                attrs['sub_hindrance_type'] = sub_type  # Allow custom if external, but prefer valid

        # Independent Engineer photo validation when submitting
        if status in ['SUBMITTED', 'PENDING_APPROVAL']:
            if attrs.get('ie_photo_needed'):
                ie_photo = attrs.get('ie_photo')
                if not ie_photo or not isinstance(ie_photo, dict) or not ie_photo.get('url'):
                    raise serializers.ValidationError({"ie_photo": "Independent Engineer photo is required when IE Photo Needed is Yes."})

        return attrs

    def create(self, validated_data):
        # Auto-generate Hindrance ID if missing
        if not validated_data.get('hindrance_id'):
            count = Hindrance.objects.count() + 105
            h_id = f"HND-2026-{count:03d}"
            while Hindrance.objects.filter(hindrance_id=h_id).exists():
                count += 1
                h_id = f"HND-2026-{count:03d}"
            validated_data['hindrance_id'] = h_id

        instance = super().create(validated_data)

        # Build proposed_hindrance and field_data
        instance.proposed_hindrance = instance.build_proposed_details()
        instance.field_data = instance.to_hindrance_task_data_json()

        # Log creation in approval history
        user_str = str(instance.created_by.username) if instance.created_by else 'System'
        initial_action = "DRAFT_SAVED" if instance.status == 'DRAFT' else "SUBMITTED_FOR_APPROVAL"
        instance.approval_history = [
            {
                "action": initial_action,
                "status": instance.status,
                "user": user_str,
                "timestamp": timezone.now().isoformat(),
                "remarks": instance.remarks or "Initial submission"
            }
        ]
        instance.save()
        return instance

    def update(self, instance, validated_data):
        prev_status = instance.status
        updated_instance = super().update(instance, validated_data)

        # If updated while in draft, update proposed_hindrance
        if updated_instance.status in ['DRAFT', 'SUBMITTED', 'PENDING_APPROVAL']:
            updated_instance.proposed_hindrance = updated_instance.build_proposed_details()

        # If status transitioned, log in approval_history
        if updated_instance.status != prev_status:
            user = self.context.get('request').user if self.context.get('request') else None
            user_str = user.username if user and user.is_authenticated else 'System'
            history = updated_instance.approval_history or []
            history.append({
                "action": f"STATUS_CHANGED_TO_{updated_instance.status}",
                "status": updated_instance.status,
                "user": user_str,
                "timestamp": timezone.now().isoformat(),
                "remarks": updated_instance.remarks or ""
            })
            updated_instance.approval_history = history

        updated_instance.field_data = updated_instance.to_hindrance_task_data_json()
        updated_instance.save()
        return updated_instance

    def to_representation(self, instance):
        ret = super().to_representation(instance)
        # Ensure canonical hindranceId is available at top level
        ret['hindranceId'] = instance.hindrance_id
        # Aliases for robust JSON compatibility
        ret['hindrenceId'] = instance.hindrance_id
        ret['id'] = instance.id
        ret['sLatitude'] = instance.s_latitude
        ret['sLongitude'] = instance.s_longitude
        ret['eLatitude'] = instance.e_latitude
        ret['eLongitude'] = instance.e_longitude
        return ret
