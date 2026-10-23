from django.http import HttpResponse
from rest_framework.views import APIView
from rest_framework import permissions, status
from rest_framework.response import Response
from apps.common.responses import success_response

from apps.common.vendor_scope import filter_queryset_by_vendor, get_user_vendor_ids
from apps.machines.models import Machine
from apps.machines.serializers import MachineSerializer
from apps.fuel.models import FuelLog
from apps.fuel.serializers import FuelLogSerializer

from .services import get_hdd_shot_report_data
from .excel_export import generate_hdd_shot_excel_report


class MachineReportView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        qs = filter_queryset_by_vendor(Machine.objects.all(), request.user, 'vendor_id', request=request)
        data = MachineSerializer(qs, many=True).data
        return success_response(data=data, message="Machine report generated")


class FuelReportView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        qs = filter_queryset_by_vendor(FuelLog.objects.all(), request.user, 'machine__vendor_id', request=request)
        data = FuelLogSerializer(qs, many=True).data
        return success_response(data=data, message="Fuel report generated")


class ExpenseReportView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        return success_response(data=[], message="Expense report generated")


class HddShotReportView(APIView):
    """
    HDD Shot Report API:
    Retrieves individual HDD shot records with machine-wise output,
    daily totals, filtering, pagination, and Excel export.

    Query Parameters:
    - start_date: Starting date (inclusive, YYYY-MM-DD or DD-MM-YYYY)
    - end_date: Ending date (inclusive, YYYY-MM-DD or DD-MM-YYYY)
    - chassis_number: Machine chassis number (exact, partial, or comma-separated)
    - machine_id: Machine ID or code
    - vendor_id: Vendor ID or name filter
    - page: Page number for pagination (default: 1)
    - page_size: Page size for pagination (default: 25; 0 for all)
    - export: 'excel' or 'xlsx' to download binary .xlsx workbook
    - refresh: 'true' / '1' to bypass cache and recompute
    """
    permission_classes = [permissions.AllowAny]

    def get(self, request):
        start_date = request.query_params.get('start_date') or request.query_params.get('startDate')
        end_date = request.query_params.get('end_date') or request.query_params.get('endDate')
        chassis_number = (
            request.query_params.get('chassis_number')
            or request.query_params.get('chassis_no')
            or request.query_params.get('chassis')
        )
        machine_id = request.query_params.get('machine_id') or request.query_params.get('machine')
        vendor_id = request.query_params.get('vendor_id') or request.query_params.get('vendor')
        circle = request.query_params.get('circle')
        district = request.query_params.get('district') or request.query_params.get('distc')
        block = request.query_params.get('block')
        today_only = str(request.query_params.get('today_only', '')).lower() in ('true', '1')
        export_format = request.query_params.get('export') or request.query_params.get('format')
        refresh = request.query_params.get('refresh', '').lower() in ('true', '1')

        # Check vendor scoping for vendor users
        scoped_vendor_ids = get_user_vendor_ids(request.user) if request.user and request.user.is_authenticated else None
        if scoped_vendor_ids:
            vendor_id = scoped_vendor_ids[0]

        is_export = str(export_format or '').lower() in ('excel', 'xlsx')
        try:
            page_size = 0 if is_export else int(request.query_params.get('page_size', 25) or 25)
        except (ValueError, TypeError):
            page_size = 25

        try:
            page = int(request.query_params.get('page', 1) or 1)
        except (ValueError, TypeError):
            page = 1

        try:
            report_data = get_hdd_shot_report_data(
                start_date=start_date,
                end_date=end_date,
                chassis_number=chassis_number,
                machine_id=machine_id,
                vendor_id=vendor_id,
                circle=circle,
                district=district,
                block=block,
                today_only=today_only,
                page=page,
                page_size=page_size,
                force_refresh=refresh
            )
        except ValueError as val_err:
            return Response(
                {"success": False, "message": str(val_err), "data": None},
                status=status.HTTP_400_BAD_REQUEST
            )
        except Exception as exc:
            return Response(
                {"success": False, "message": f"Error generating HDD shot report: {str(exc)}", "data": None},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )

        if is_export:
            filters_applied = {
                'start_date': start_date,
                'end_date': end_date,
                'chassis_number': chassis_number,
                'machine_id': machine_id,
                'circle': circle,
                'district': district,
                'block': block,
            }
            if vendor_id:
                filters_applied['vendor_name'] = str(vendor_id)

            excel_content = generate_hdd_shot_excel_report(
                shots=report_data['all_filtered_records'],
                daily_summary=report_data['daily_summary'],
                filters_applied=filters_applied,
                today_records=report_data.get('today_records'),
                effective_today=report_data.get('effective_today'),
                execution_summary=report_data.get('execution_summary')
            )

            filename = "hero_hdd_shot_report.xlsx"
            if today_only:
                filename = f"hero_hdd_shot_report_today_{report_data.get('effective_today', '')}.xlsx"
            elif chassis_number:
                filename = f"hero_hdd_shot_report_{chassis_number}.xlsx"

            response = HttpResponse(
                excel_content,
                content_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            )
            response['Content-Disposition'] = f'attachment; filename="{filename}"'
            response['Access-Control-Expose-Headers'] = 'Content-Disposition'
            return response

        return success_response(
            data={
                "results": report_data['results'],
                "pagination": report_data['pagination'],
                "summary": report_data['summary'],
                "daily_summary": report_data['daily_summary'],
                "filter_options": report_data['filter_options'],
                "analytics": report_data.get('analytics', {}),
                "execution_summary": report_data.get('execution_summary', {}),
                "daily_machine_summary": report_data.get('daily_machine_summary', {}),
                "selected_report_date": report_data.get('selected_report_date', ''),
                "effective_today": report_data.get('effective_today', ''),
            },
            message="HDD Shot report generated successfully"
        )

