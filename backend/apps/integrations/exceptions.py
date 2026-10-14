from rest_framework.exceptions import APIException
from rest_framework import status

class IlyncAPIException(APIException):
    status_code = status.HTTP_500_INTERNAL_SERVER_ERROR
    default_detail = "Upstream ILYNC API Error"

    def __init__(self, message="Upstream ILYNC API Error", status_code=500, payload=None):
        super().__init__(detail=message, code=status_code)
        self.message = message
        self.status_code = status_code
        self.payload = payload or {}

class IlyncAuthException(IlyncAPIException):
    status_code = status.HTTP_401_UNAUTHORIZED
    default_detail = "ILYNC authentication failed"

    def __init__(self, message="ILYNC authentication failed"):
        super().__init__(message=message, status_code=status.HTTP_401_UNAUTHORIZED)

class IlyncTimeoutException(IlyncAPIException):
    status_code = status.HTTP_504_GATEWAY_TIMEOUT
    default_detail = "ILYNC request timed out"

    def __init__(self, message="ILYNC request timed out"):
        super().__init__(message=message, status_code=status.HTTP_504_GATEWAY_TIMEOUT)

class IlyncNotFoundException(IlyncAPIException):
    status_code = status.HTTP_404_NOT_FOUND
    default_detail = "ILYNC resource not found"

    def __init__(self, message="ILYNC resource not found"):
        super().__init__(message=message, status_code=status.HTTP_404_NOT_FOUND)

class IlyncRateLimitException(IlyncAPIException):
    status_code = status.HTTP_429_TOO_MANY_REQUESTS
    default_detail = "ILYNC rate limit exceeded"

    def __init__(self, message="ILYNC rate limit exceeded"):
        super().__init__(message=message, status_code=status.HTTP_429_TOO_MANY_REQUESTS)

