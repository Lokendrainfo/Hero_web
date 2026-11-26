from django.core.management.base import BaseCommand
from django.db import transaction
from django.db.models import Q

from apps.maintenance.models import (
    ChecklistConditionRule,
    ChecklistCustomFieldConfig,
    ChecklistFrequencyMapping,
    ChecklistFrequencySchedule,
    ChecklistLocationRequirement,
    ChecklistPhotoRequirement,
    ChecklistQuestionOption,
    ChecklistVideoRequirement,
    MaintenanceApprovalReview,
    MaintenanceAuditLog,
    MaintenanceChecklistMaster,
    MaintenanceChecklistResponse,
    MaintenanceLocationAttachment,
    MaintenancePhotoAttachment,
    MaintenanceQuestionResponse,
    MaintenanceSubmission,
    MaintenanceVideoAttachment,
)


class Command(BaseCommand):
    help = (
        "Deletes ONLY machine_pm_db records explicitly tagged with 'TEST-DUMMY' or 'TEST-PM-' "
        "without modifying hero_hdd_db or real maintenance records. Defaults to dry-run."
    )

    def add_arguments(self, parser):
        parser.add_argument(
            '--execute',
            action='store_true',
            help='Actually delete TEST-DUMMY records inside a transaction on default (machine_pm_db).',
        )

    def handle(self, *args, **options):
        execute = bool(options.get('execute', False))

        dummy_items_qs = MaintenanceChecklistMaster.objects.filter(
            Q(item_code__istartswith='TEST-DUMMY')
            | Q(item_code__istartswith='TEST-PM-')
            | Q(description__icontains='TEST-DUMMY')
        )
        dummy_item_ids = list(dummy_items_qs.values_list('id', flat=True))

        dummy_subs_qs = MaintenanceSubmission.objects.filter(
            Q(machine_number__istartswith='TEST-DUMMY')
            | Q(machine_name__icontains='TEST-DUMMY')
            | Q(vendor_name__icontains='TEST-DUMMY')
            | Q(submitted_by_name__icontains='TEST-DUMMY')
            | Q(general_remarks__icontains='TEST-DUMMY')
            | Q(responses__checklist_item_id__in=dummy_item_ids)
        ).distinct()
        dummy_sub_ids = list(dummy_subs_qs.values_list('id', flat=True))

        dummy_photos_qs = MaintenancePhotoAttachment.objects.filter(
            Q(submission_id__in=dummy_sub_ids) | Q(checklist_item_id__in=dummy_item_ids)
        )
        dummy_videos_qs = MaintenanceVideoAttachment.objects.filter(
            Q(submission_id__in=dummy_sub_ids) | Q(checklist_item_id__in=dummy_item_ids)
        )
        dummy_locs_qs = MaintenanceLocationAttachment.objects.filter(
            Q(submission_id__in=dummy_sub_ids) | Q(checklist_item_id__in=dummy_item_ids)
        )
        dummy_q_resps_qs = MaintenanceQuestionResponse.objects.filter(
            Q(submission_id__in=dummy_sub_ids) | Q(checklist_item_id__in=dummy_item_ids)
        )
        dummy_c_resps_qs = MaintenanceChecklistResponse.objects.filter(
            Q(submission_id__in=dummy_sub_ids) | Q(checklist_item_id__in=dummy_item_ids)
        )
        dummy_reviews_qs = MaintenanceApprovalReview.objects.filter(submission_id__in=dummy_sub_ids)

        dummy_rules_qs = ChecklistConditionRule.objects.filter(checklist_item_id__in=dummy_item_ids)
        dummy_questions_qs = ChecklistCustomFieldConfig.objects.filter(checklist_item_id__in=dummy_item_ids)
        dummy_q_ids = list(dummy_questions_qs.values_list('id', flat=True))
        dummy_opts_qs = ChecklistQuestionOption.objects.filter(question_id__in=dummy_q_ids)
        dummy_photo_reqs_qs = ChecklistPhotoRequirement.objects.filter(checklist_item_id__in=dummy_item_ids)
        dummy_video_reqs_qs = ChecklistVideoRequirement.objects.filter(checklist_item_id__in=dummy_item_ids)
        dummy_loc_reqs_qs = ChecklistLocationRequirement.objects.filter(checklist_item_id__in=dummy_item_ids)
        dummy_scheds_qs = ChecklistFrequencySchedule.objects.filter(checklist_item_id__in=dummy_item_ids)
        dummy_maps_qs = ChecklistFrequencyMapping.objects.filter(checklist_item_id__in=dummy_item_ids)

        dummy_audit_qs = MaintenanceAuditLog.objects.filter(
            Q(actor_username__istartswith='TEST-DUMMY')
            | Q(details__icontains='TEST-DUMMY')
            | Q(details__icontains='TEST-PM-')
        )

        counts = {
            'submissions': len(dummy_sub_ids),
            'checklist_responses': dummy_c_resps_qs.count(),
            'question_responses': dummy_q_resps_qs.count(),
            'photos': dummy_photos_qs.count(),
            'videos': dummy_videos_qs.count(),
            'locations': dummy_locs_qs.count(),
            'reviews': dummy_reviews_qs.count(),
            'checklist_items': len(dummy_item_ids),
            'frequency_mappings': dummy_maps_qs.count(),
            'frequency_schedules': dummy_scheds_qs.count(),
            'questions': len(dummy_q_ids),
            'question_options': dummy_opts_qs.count(),
            'photo_requirements': dummy_photo_reqs_qs.count(),
            'video_requirements': dummy_video_reqs_qs.count(),
            'location_requirements': dummy_loc_reqs_qs.count(),
            'condition_rules': dummy_rules_qs.count(),
            'audit_logs': dummy_audit_qs.count(),
        }

        self.stdout.write("=== TEST-DUMMY PM CLEANUP PLAN (machine_pm_db ONLY) ===")
        self.stdout.write(f"Mode: {'EXECUTE' if execute else 'DRY-RUN (no records modified)'}")
        for k, v in counts.items():
            self.stdout.write(f"  - {k}: {v}")

        if not execute:
            self.stdout.write(
                self.style.WARNING("Dry-run complete. Run with --execute to delete only TEST-DUMMY records.")
            )
            return

        with transaction.atomic(using='default'):
            dummy_reviews_qs.delete()
            dummy_locs_qs.delete()
            dummy_videos_qs.delete()
            dummy_photos_qs.delete()
            dummy_q_resps_qs.delete()
            dummy_c_resps_qs.delete()
            MaintenanceSubmission.objects.filter(id__in=dummy_sub_ids).delete()

            dummy_rules_qs.delete()
            dummy_opts_qs.delete()
            dummy_loc_reqs_qs.delete()
            dummy_video_reqs_qs.delete()
            dummy_photo_reqs_qs.delete()
            dummy_questions_qs.delete()
            dummy_scheds_qs.delete()
            dummy_maps_qs.delete()
            MaintenanceChecklistMaster.objects.filter(id__in=dummy_item_ids).delete()
            dummy_audit_qs.delete()

        self.stdout.write(self.style.SUCCESS("Deleted all TEST-DUMMY records from machine_pm_db."))
