from .models import Machine

def get_active_machines_for_vendor(vendor):
    return Machine.objects.filter(vendor=vendor, status__in=['WORKING', 'IDLE'])
