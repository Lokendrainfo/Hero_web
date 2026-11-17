import logging
from rest_framework.views import exception_handler
from rest_framework.response import Response
from rest_framework import status

logger = logging.getLogger(__name__)

def custom_exception_handler(exc, context):
    response = exception_handler(exc, context)
    if response is not None:
        custom_data = {
            "success": False,
            "message": str(exc.detail) if hasattr(exc, 'detail') else str(exc),
            "errors": response.data if isinstance(response.data, dict) else {"detail": response.data},
            "status_code": response.status_code
        }
        if response.status_code == status.HTTP_429_TOO_MANY_REQUESTS:
            custom_data["error"] = "Too Many Requests"
            wait_val = getattr(exc, 'wait', None)
            if wait_val is not None:
                custom_data["retry_after"] = round(float(wait_val), 3)
            elif 'Retry-After' in response:
                custom_data["retry_after"] = response['Retry-After']
        response.data = custom_data
    else:
        # Check if exception has custom status code or message
        status_code = getattr(exc, 'status_code', status.HTTP_500_INTERNAL_SERVER_ERROR)
        msg = getattr(exc, 'message', None) or str(exc)
        
        view = context.get('view') if context else None
        view_name = view.__class__.__name__ if view else 'UnknownView'
        logger.exception("Unhandled exception in API view %s: %s", view_name, exc)

        return Response({
            "success": False,
            "message": msg if status_code != status.HTTP_500_INTERNAL_SERVER_ERROR else "Internal server error occurred",
            "errors": {"detail": str(exc)},
            "status_code": status_code
        }, status=status_code)
    return response

