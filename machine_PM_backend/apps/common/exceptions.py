import logging
from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import exception_handler

logger = logging.getLogger(__name__)


def _flatten_error_message(detail):
    if isinstance(detail, list) and detail:
        return _flatten_error_message(detail[0])
    if isinstance(detail, dict):
        for v in detail.values():
            return _flatten_error_message(v)
    return str(detail)


def custom_exception_handler(exc, context):
    response = exception_handler(exc, context)
    if response is not None:
        detail = getattr(exc, 'detail', response.data)
        custom_data = {
            "success": False,
            "message": _flatten_error_message(detail),
            "errors": response.data if isinstance(response.data, dict) else {"detail": response.data},
            "status_code": response.status_code,
        }
        response.data = custom_data
        return response

    status_code = getattr(exc, 'status_code', status.HTTP_500_INTERNAL_SERVER_ERROR)
    msg = getattr(exc, 'message', None) or str(exc)
    view = context.get('view') if context else None
    view_name = view.__class__.__name__ if view else 'UnknownView'
    logger.exception("Unhandled exception in PM API view %s: %s", view_name, exc)

    return Response(
        {
            "success": False,
            "message": msg if status_code != status.HTTP_500_INTERNAL_SERVER_ERROR else "Internal server error occurred",
            "errors": {"detail": str(exc)},
            "status_code": status_code,
        },
        status=status_code,
    )

