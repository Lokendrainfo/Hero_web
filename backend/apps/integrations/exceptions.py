class IlyncAPIException(Exception):
    def __init__(self, message="Upstream ILYNC API Error", status_code=500, payload=None):
        super().__init__(message)
        self.message = message
        self.status_code = status_code
        self.payload = payload or {}

class IlyncAuthException(IlyncAPIException):
    def __init__(self, message="ILYNC authentication failed"):
        super().__init__(message=message, status_code=401)

class IlyncTimeoutException(IlyncAPIException):
    def __init__(self, message="ILYNC request timed out"):
        super().__init__(message=message, status_code=504)

class IlyncNotFoundException(IlyncAPIException):
    def __init__(self, message="ILYNC resource not found"):
        super().__init__(message=message, status_code=404)

class IlyncRateLimitException(IlyncAPIException):
    def __init__(self, message="ILYNC rate limit exceeded"):
        super().__init__(message=message, status_code=429)
