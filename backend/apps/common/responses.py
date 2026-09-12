from rest_framework.response import Response
from rest_framework import status

def success_response(data=None, message="Request successful", meta=None, status_code=status.HTTP_200_OK):
    return Response({
        "success": True,
        "message": message,
        "data": data if data is not None else {},
        "meta": meta if meta is not None else {}
    }, status=status_code)

def error_response(message="Request failed", errors=None, status_code=status.HTTP_400_BAD_REQUEST):
    return Response({
        "success": False,
        "message": message,
        "errors": errors if errors is not None else {},
        "status_code": status_code
    }, status=status_code)
