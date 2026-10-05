from django.http import JsonResponse


class VendorIsolationMiddleware:
    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        if hasattr(request, 'user') and request.user.is_authenticated:
            # Strict role-based isolation: BharatNet service account is strictly limited to T&D monitoring & live view
            is_bharatnet = (
                getattr(request.user, 'role', '') == 'BHARATNET_SERVICE'
                or getattr(request.user, 'username', '') == 'bharatnet_service'
            )
            if is_bharatnet:
                path = getattr(request, 'path', '') or ''
                allowed_prefixes = (
                    '/api/v1/td-monitoring',
                    '/api/v1/bharatnet',
                    '/api/v1/live-view',
                )
                if not any(path.startswith(prefix) for prefix in allowed_prefixes) and path != '/api/v1/':
                    return JsonResponse(
                        {
                            "status": "ERROR",
                            "message": "Permission denied. BharatNet service account only has access to T&D monitoring and live view endpoints."
                        },
                        status=403
                    )
            request.vendor = getattr(request.user, 'vendor', None)
        else:
            request.vendor = None
        response = self.get_response(request)
        return response
