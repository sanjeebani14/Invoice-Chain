import os
from fastapi import Response

# Match your existing settings
ACCESS_TOKEN_COOKIE_MAX_AGE = 900
REFRESH_TOKEN_COOKIE_MAX_AGE = 604800
SECURE_COOKIES = os.getenv("ENVIRONMENT", "development") == "production"

def set_auth_cookies(response: Response, access_token: str, refresh_token: str):
    """Helper function to set authentication cookies consistently."""
    response.set_cookie(
        key="access_token",
        value=access_token,
        max_age=ACCESS_TOKEN_COOKIE_MAX_AGE,
        httponly=True,
        secure=SECURE_COOKIES,
        samesite="lax"
    )
    response.set_cookie(
        key="refresh_token",
        value=refresh_token,
        max_age=REFRESH_TOKEN_COOKIE_MAX_AGE,
        httponly=True,
        secure=SECURE_COOKIES,
        samesite="lax"
    )

def clear_auth_cookies(response: Response):
    """Helper function to clear authentication cookies."""
    response.delete_cookie(key="access_token", httponly=True, secure=SECURE_COOKIES, samesite="lax")
    response.delete_cookie(key="refresh_token", httponly=True, secure=SECURE_COOKIES, samesite="lax")