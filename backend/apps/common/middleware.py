class VendorIsolationMiddleware:
    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        if hasattr(request, 'user') and request.user.is_authenticated:
            request.vendor = getattr(request.user, 'vendor', None)
        else:
            request.vendor = None
        response = self.get_response(request)
        return response
