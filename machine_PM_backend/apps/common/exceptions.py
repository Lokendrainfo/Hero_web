import logging
from rest_framework import status
from rest_framework.exceptions import APIException
from rest_framework.response import Response
from rest_framework.views import exception_handler

logger = logging.getLogger(__name__)


class ConflictError(APIException):
    status_code = status.HTTP_409_CONFLICT
    default_detail = 'Duplicate submission or conflicting state detected.'
    default_code = 'conflict'


class PayloadTooLargeError(APIException):
    status_code = status.HTTP_413_REQUEST_ENTITY_TOO_LARGE
    default_detail = 'Uploaded media exceeds the maximum allowed size.'
    default_code = 'payload_too_large'


class UnsupportedMediaTypeError(APIException):
    status_code = status.HTTP_415_UNSUPPORTED_MEDIA_TYPE
    default_detail = 'Unsupported media format.'
    default_code = 'unsupported_media_type'


class UnprocessableEntityError(APIException):
    status_code = status.HTTP_422_UNPROCESSABLE_ENTITY
    default_detail = 'Invalid question answer or evidence configuration.'
    default_code = 'unprocessable_entity'


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
            "errors": response.data if isinstance(response.data, (dict, list)) else {"detail": response.data},
            "status_code": response.status_code,
        }
        response.data = custom_data
        return response

    status_code = getattr(exc, 'status_code', status.HTTP_500_INTERNAL_SERVER_ERROR)
    view = context.get('view') if context else None
    view_name = view.__class__.__name__ if view else 'UnknownView'
    logger.exception("Unhandled exception in PM API view %s: %s", view_name, exc)

    # Never expose internal stack traces, SQL errors, or credentials to API callers
    safe_message = (
        "An unexpected server error occurred. Please try again later."
        if status_code >= 500
        else (getattr(exc, 'message', None) or "Request failed.")
    )
    return Response(
        {
            "success": False,
            "message": safe_message,
            "errors": {"detail": safe_message},
            "status_code": status_code,
        },
        status=status_code,
    )

