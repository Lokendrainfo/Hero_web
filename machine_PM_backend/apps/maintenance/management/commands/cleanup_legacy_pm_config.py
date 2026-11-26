from django.core.management.base import BaseCommand
from django.db import transaction
from django.db.models import Count, Q

from apps.maintenance.models import (
    ChecklistConditionRule,
    ChecklistCustomFieldConfig,
    ChecklistFrequencyMapping,
    ChecklistLocationRequirement,
    ChecklistPhotoRequirement,
    ChecklistQuestionOption,
    ChecklistVideoRequirement,
    MaintenanceApprovalReview,
    MaintenanceAuditLog,
    MaintenanceChecklistMaster,
    MaintenanceChecklistResponse,
    MaintenanceFrequencyMaster,
    MaintenanceLocationAttachment,
    MaintenancePhotoAttachment,
    MaintenanceQuestionResponse,
    MaintenanceSubmission,
    MaintenanceVideoAttachment,
    RoleFrequencyMapping,
)

LEGACY_HOUR_FREQ_CODES = ['50_HOURS', '100_HOURS', '250_HOURS', '500_HOURS', '1000_HOURS']


class Command(BaseCommand):
    help = (
        "Safely inspect and clean up obsolete pre-redesign PM configurations "
        "(legacy SOP items, hour-based frequencies, duplicate rules) while strictly "
        "preserving all historical submissions, responses, media attachments, GPS data, and audit logs."
    )

    def add_arguments(self, parser):
        parser.add_argument(
            '--execute',
            action='store_true',
            help='Apply the cleanup inside a database transaction (default is dry-run inspection only).',
        )

    def _collect_plan(self):
        # 1. Legacy hour-based frequencies (50_HOURS .. 1000_HOURS)
        legacy_freqs = list(
            MaintenanceFrequencyMaster.objects.filter(code__in=LEGACY_HOUR_FREQ_CODES).order_by('id')
        )
        legacy_freq_ids = [f.id for f in legacy_freqs]
        sub_refs_by_freq = {
            f.code: MaintenanceSubmission.objects.filter(frequency_id=f.id).count()
            for f in legacy_freqs
        }
        deletable_freqs = [f for f in legacy_freqs if sub_refs_by_freq[f.code] == 0]
        protected_freqs = [f for f in legacy_freqs if sub_refs_by_freq[f.code] > 0]
        deletable_freq_ids = [f.id for f in deletable_freqs]

        obsolete_role_mappings = list(
            RoleFrequencyMapping.objects.select_related('frequency')
            .filter(frequency_id__in=deletable_freq_ids)
            .order_by('id')
        )

        # 2. Legacy seeded SOP checkable items (SOP-MCH-* / SOP-ENG-*) & duplicate active configs
        legacy_sop_items = list(
            MaintenanceChecklistMaster.objects.select_related('category')
            .filter(category__is_checkable=True)
            .filter(Q(item_code__startswith='SOP-MCH-') | Q(item_code__startswith='SOP-ENG-'))
            .order_by('id')
        )

        # Also detect any exact duplicate active non-archived items by (category_id, lower(description))
        seen_active_names = {}
        duplicate_items = []
        for ci in (
            MaintenanceChecklistMaster.objects.select_related('category')
            .filter(category__is_checkable=True, is_archived=False)
            .exclude(Q(item_code__startswith='SOP-MCH-') | Q(item_code__startswith='SOP-ENG-'))
            .order_by('id')
        ):
            key = (ci.category_id, ci.description.strip().lower())
            if key in seen_active_names:
                duplicate_items.append(ci)
            else:
                seen_active_names[key] = ci.id

        candidate_items = {ci.id: ci for ci in (legacy_sop_items + duplicate_items)}.values()

        items_to_delete = []
        items_to_archive = []
        for ci in sorted(candidate_items, key=lambda x: x.id):
            hist_counts = {
                'checklist_responses': MaintenanceChecklistResponse.objects.filter(checklist_item_id=ci.id).count(),
                'question_responses': MaintenanceQuestionResponse.objects.filter(checklist_item_id=ci.id).count(),
                'photos': MaintenancePhotoAttachment.objects.filter(checklist_item_id=ci.id).count(),
                'videos': MaintenanceVideoAttachment.objects.filter(checklist_item_id=ci.id).count(),
                'locations': MaintenanceLocationAttachment.objects.filter(checklist_item_id=ci.id).count(),
            }
            total_hist = sum(hist_counts.values())
            if total_hist > 0:
                if not ci.is_archived or ci.is_active:
                    items_to_archive.append((ci, hist_counts))
            else:
                items_to_delete.append(ci)

        affected_item_ids = [ci.id for ci in candidate_items]

        # 3. Child configuration rows tied to affected items or obsolete hour-based frequencies
        freq_mappings = list(
            ChecklistFrequencyMapping.objects.select_related('checklist_item', 'frequency')
            .filter(Q(checklist_item_id__in=affected_item_ids) | Q(frequency_id__in=legacy_freq_ids))
            .order_by('id')
        )
        condition_rules = list(
            ChecklistConditionRule.objects.filter(checklist_item_id__in=affected_item_ids).order_by('id')
        )
        questions = list(
            ChecklistCustomFieldConfig.objects.filter(
                Q(checklist_item_id__in=affected_item_ids) | Q(frequency_id__in=legacy_freq_ids)
            ).order_by('id')
        )
        question_ids = [q.id for q in questions]
        question_options = list(
            ChecklistQuestionOption.objects.filter(question_id__in=question_ids).order_by('id')
        )
        photo_reqs = list(
            ChecklistPhotoRequirement.objects.filter(
                Q(checklist_item_id__in=affected_item_ids) | Q(frequency_id__in=legacy_freq_ids)
            ).order_by('id')
        )
        video_reqs = list(
            ChecklistVideoRequirement.objects.filter(
                Q(checklist_item_id__in=affected_item_ids) | Q(frequency_id__in=legacy_freq_ids)
            ).order_by('id')
        )
        location_reqs = list(
            ChecklistLocationRequirement.objects.filter(
                Q(checklist_item_id__in=affected_item_ids) | Q(frequency_id__in=legacy_freq_ids)
            ).order_by('id')
        )

        # Duplicate ChecklistFrequencyMapping rows on remaining non-archived items (if any)
        dup_freq_mapping_ids = []
        dup_fm_groups = (
            ChecklistFrequencyMapping.objects.exclude(id__in=[m.id for m in freq_mappings])
            .values('checklist_item_id', 'frequency_id')
            .annotate(cnt=Count('id'))
            .filter(cnt__gt=1)
        )
        for grp in dup_fm_groups:
            ids = list(
                ChecklistFrequencyMapping.objects.filter(
                    checklist_item_id=grp['checklist_item_id'],
                    frequency_id=grp['frequency_id'],
                )
                .order_by('-is_active', 'id')
                .values_list('id', flat=True)
            )
            dup_freq_mapping_ids.extend(ids[1:])

        historical_snapshot = {
            'MaintenanceSubmission': MaintenanceSubmission.objects.count(),
            'MaintenanceChecklistResponse': MaintenanceChecklistResponse.objects.count(),
            'MaintenanceQuestionResponse': MaintenanceQuestionResponse.objects.count(),
            'MaintenancePhotoAttachment': MaintenancePhotoAttachment.objects.count(),
            'MaintenanceVideoAttachment': MaintenanceVideoAttachment.objects.count(),
            'MaintenanceLocationAttachment': MaintenanceLocationAttachment.objects.count(),
            'MaintenanceApprovalReview': MaintenanceApprovalReview.objects.count(),
            'MaintenanceAuditLog': MaintenanceAuditLog.objects.count(),
        }

        return {
            'deletable_freqs': deletable_freqs,
            'protected_freqs': protected_freqs,
            'obsolete_role_mappings': obsolete_role_mappings,
            'items_to_delete': items_to_delete,
            'items_to_archive': items_to_archive,
            'freq_mappings': freq_mappings,
            'dup_freq_mapping_ids': dup_freq_mapping_ids,
            'condition_rules': condition_rules,
            'questions': questions,
            'question_options': question_options,
            'photo_reqs': photo_reqs,
            'video_reqs': video_reqs,
            'location_reqs': location_reqs,
            'historical_snapshot': historical_snapshot,
        }

    def handle(self, *args, **options):
        execute = bool(options.get('execute', False))
        plan = self._collect_plan()

        self.stdout.write("=== LEGACY PM CONFIGURATION CLEANUP REPORT ===")
        self.stdout.write(f"Mode: {'EXECUTE (TRANSACTIONAL)' if execute else 'DRY-RUN (NO DB WRITES)'}")

        self.stdout.write("\n[Historical Records Strictly Preserved (0 deletions)]")
        for model_name, cnt in plan['historical_snapshot'].items():
            self.stdout.write(f"  - {model_name}: {cnt} row(s)")

        self.stdout.write("\n[1] Legacy Hour-Based Frequencies Proposed for Deletion]")
        if not plan['deletable_freqs']:
            self.stdout.write("  (None)")
        for f in plan['deletable_freqs']:
            self.stdout.write(f"  DELETE MaintenanceFrequencyMaster id={f.id} code={f.code} name='{f.name}' (submissions=0)")
        for f in plan['protected_freqs']:
            self.stdout.write(f"  PROTECTED (cannot delete) id={f.id} code={f.code}")

        self.stdout.write("\n[2] Obsolete Role-Frequency Mappings Proposed for Deletion]")
        if not plan['obsolete_role_mappings']:
            self.stdout.write("  (None)")
        for rm in plan['obsolete_role_mappings']:
            self.stdout.write(f"  DELETE RoleFrequencyMapping id={rm.id} role={rm.role_code} freq={rm.frequency.code}")

        self.stdout.write("\n[3] Obsolete ChecklistFrequencyMappings Proposed for Deletion]")
        if not plan['freq_mappings'] and not plan['dup_freq_mapping_ids']:
            self.stdout.write("  (None)")
        for m in plan['freq_mappings']:
            self.stdout.write(f"  DELETE ChecklistFrequencyMapping id={m.id} item={m.checklist_item.item_code} -> {m.frequency.code}")
        for mid in plan['dup_freq_mapping_ids']:
            self.stdout.write(f"  DELETE Duplicate ChecklistFrequencyMapping id={mid}")

        self.stdout.write("\n[4] Unreferenced Legacy Checklist Items Proposed for Hard Deletion]")
        if not plan['items_to_delete']:
            self.stdout.write("  (None)")
        for ci in plan['items_to_delete']:
            self.stdout.write(f"  DELETE MaintenanceChecklistMaster id={ci.id} code={ci.item_code} desc='{ci.description}' (hist=0)")

        self.stdout.write("\n[5] Historically-Referenced Legacy Items Proposed for FK-Safe Archival (PROTECT Preserved)]")
        if not plan['items_to_archive']:
            self.stdout.write("  (None)")
        for ci, hist in plan['items_to_archive']:
            self.stdout.write(
                f"  ARCHIVE (is_archived=True, is_active=False) MaintenanceChecklistMaster "
                f"id={ci.id} code={ci.item_code} desc='{ci.description}' | protected_refs={hist}"
            )

        self.stdout.write("\n[6] Legacy Nested Questions / Options / Photos / Videos / GPS / Rules Proposed for Deletion]")
        self.stdout.write(
            f"  ChecklistConditionRule={len(plan['condition_rules'])}, "
            f"ChecklistQuestionOption={len(plan['question_options'])}, "
            f"ChecklistCustomFieldConfig={len(plan['questions'])}, "
            f"ChecklistPhotoRequirement={len(plan['photo_reqs'])}, "
            f"ChecklistVideoRequirement={len(plan['video_reqs'])}, "
            f"ChecklistLocationRequirement={len(plan['location_reqs'])}"
        )

        if not execute:
            self.stdout.write(self.style.WARNING("\nDry-run complete. Re-run with --execute to apply changes atomically."))
            return

        total_changes = (
            len(plan['deletable_freqs'])
            + len(plan['obsolete_role_mappings'])
            + len(plan['items_to_delete'])
            + len(plan['items_to_archive'])
            + len(plan['freq_mappings'])
            + len(plan['dup_freq_mapping_ids'])
            + len(plan['condition_rules'])
            + len(plan['question_options'])
            + len(plan['questions'])
            + len(plan['photo_reqs'])
            + len(plan['video_reqs'])
            + len(plan['location_reqs'])
        )
        if total_changes == 0:
            self.stdout.write(self.style.SUCCESS("\nDatabase is already clean (idempotent no-op)."))
            return

        with transaction.atomic(using='default'):
            # Remove rules -> options -> evidence -> questions -> mappings -> unreferenced master items -> role maps -> hour freqs
            ChecklistConditionRule.objects.filter(id__in=[r.id for r in plan['condition_rules']]).delete()
            ChecklistQuestionOption.objects.filter(id__in=[o.id for o in plan['question_options']]).delete()
            ChecklistPhotoRequirement.objects.filter(id__in=[p.id for p in plan['photo_reqs']]).delete()
            ChecklistVideoRequirement.objects.filter(id__in=[v.id for v in plan['video_reqs']]).delete()
            ChecklistLocationRequirement.objects.filter(id__in=[l.id for l in plan['location_reqs']]).delete()
            ChecklistCustomFieldConfig.objects.filter(id__in=[q.id for q in plan['questions']]).delete()

            fm_ids = [m.id for m in plan['freq_mappings']] + list(plan['dup_freq_mapping_ids'])
            if fm_ids:
                ChecklistFrequencyMapping.objects.filter(id__in=fm_ids).delete()

            for ci, _ in plan['items_to_archive']:
                ci.is_active = False
                ci.is_archived = True
                ci.requires_photo = False
                ci.save(update_fields=['is_active', 'is_archived', 'requires_photo', 'updated_at'])

            if plan['items_to_delete']:
                MaintenanceChecklistMaster.objects.filter(id__in=[ci.id for ci in plan['items_to_delete']]).delete()

            if plan['obsolete_role_mappings']:
                RoleFrequencyMapping.objects.filter(id__in=[rm.id for rm in plan['obsolete_role_mappings']]).delete()

            if plan['deletable_freqs']:
                MaintenanceFrequencyMaster.objects.filter(id__in=[f.id for f in plan['deletable_freqs']]).delete()

            MaintenanceAuditLog.objects.create(
                entity_type='SYSTEM_CLEANUP',
                entity_id='legacy-pm-config',
                action='LEGACY_CONFIG_CLEANED',
                actor_id=None,
                actor_username='system-cleanup',
                actor_role='SYSTEM',
                details={
                    'deleted_frequencies': [f.code for f in plan['deletable_freqs']],
                    'deleted_role_mappings_count': len(plan['obsolete_role_mappings']),
                    'deleted_frequency_mappings_count': len(fm_ids),
                    'deleted_checklist_items': [ci.item_code for ci in plan['items_to_delete']],
                    'archived_protected_checklist_items': [ci.item_code for ci, _ in plan['items_to_archive']],
                    'preserved_historical_counts': plan['historical_snapshot'],
                },
            )

        self.stdout.write(self.style.SUCCESS("\nCleanup executed successfully inside transaction. All historical data preserved."))
