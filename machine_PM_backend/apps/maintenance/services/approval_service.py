from django.db import transaction
from django.utils import timezone
from rest_framework.exceptions import PermissionDenied, ValidationError

from apps.hero_integration.permissions import can_review_submission, get_primary_pm_role
from apps.hero_integration.services import get_authorized_machine_or_403
from apps.maintenance.models import MaintenanceApprovalReview, MaintenanceSubmission
from .audit_service import record_audit_log

VALID_ACTIONS = {
    MaintenanceApprovalReview.ACTION_APPROVED: MaintenanceSubmission.APPROVAL_APPROVED,
    MaintenanceApprovalReview.ACTION_REJECTED: MaintenanceSubmission.APPROVAL_REJECTED,
    MaintenanceApprovalReview.ACTION_CHANGES_REQUESTED: MaintenanceSubmission.APPROVAL_CHANGES_REQUESTED,
}


@transaction.atomic
def review_submission(user, submission: MaintenanceSubmission, action: str, remarks: str = '', request=None) -> MaintenanceApprovalReview:
    if not can_review_submission(user):
        raise PermissionDenied("Only Area Manager or Admin roles can review or approve maintenance submissions.")

    # Enforce vendor isolation on machine
    get_authorized_machine_or_403(user, submission.machine_id)

    norm_action = str(action or '').strip().upper()
    if norm_action not in VALID_ACTIONS:
        raise ValidationError({"action": f"Invalid review action '{action}'. Must be APPROVED, REJECTED, or CHANGES_REQUESTED."})

    cleaned_remarks = str(remarks or '').strip()
    if norm_action in (MaintenanceApprovalReview.ACTION_REJECTED, MaintenanceApprovalReview.ACTION_CHANGES_REQUESTED) and not cleaned_remarks:
        raise ValidationError({"remarks": "Remarks are required when rejecting or requesting changes."})

    prev_status = submission.approval_status
    new_status = VALID_ACTIONS[norm_action]
    submission.approval_status = new_status
    submission.save(update_fields=['approval_status', 'updated_at'])

    review = MaintenanceApprovalReview.objects.create(
        submission=submission,
        reviewer=user,
        reviewer_name=user.get_display_name(),
        reviewer_role=get_primary_pm_role(user),
        action=norm_action,
        previous_status=prev_status,
        new_status=new_status,
        remarks=cleaned_remarks,
        reviewed_at=timezone.now(),
    )

    record_audit_log(
        entity_type='APPROVAL',
        entity_id=review.id,
        action=f"SUBMISSION_{norm_action}",
        actor=user,
        machine_id=submission.machine_id,
        frequency_code=submission.frequency.code,
        details={
            "submission_id": submission.id,
            "submission_number": submission.submission_number,
            "previous_status": prev_status,
            "new_status": new_status,
            "remarks": cleaned_remarks,
        },
        request=request,
    )
    return review

