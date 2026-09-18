from rest_framework_simplejwt.authentication import JWTAuthentication
from rest_framework_simplejwt.exceptions import InvalidToken, AuthenticationFailed


class HeroJWTAuthentication(JWTAuthentication):
    """Supports internal Django users and external (iLync) claim-based sessions."""

    def get_user(self, validated_token):
        if validated_token.get("origin") == "external":
            from apps.authentication.external_user import ExternalUser
            try:
                return ExternalUser.from_token(validated_token)
            except Exception as exc:
                raise InvalidToken(f"Invalid external token: {exc}") from exc
        return super().get_user(validated_token)
