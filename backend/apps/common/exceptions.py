from rest_framework.views import exception_handler
from rest_framework.response import Response
from rest_framework import status

def custom_exception_handler(exc, context):
    response = exception_handler(exc, context)
    if response is not None:
        custom_data = {
            "success": False,
            "message": str(exc.detail) if hasattr(exc, 'detail') else str(exc),
            "errors": response.data if isinstance(response.data, dict) else {"detail": response.data},
            "status_code": response.status_code
        }
        response.data = custom_data
    else:
        return Response({
            "success": False,
            "message": "Internal server error occurred",
            "errors": {"detail": str(exc)},
            "status_code": status.HTTP_500_INTERNAL_SERVER_ERROR
        }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
    return response
