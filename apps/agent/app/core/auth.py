"""
JWT Authentication middleware for FastAPI.

Validates JWT tokens issued by NextAuth.js and extracts user information.
"""

import os
from typing import Optional
from fastapi import HTTPException, Depends, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from jose import jwt, JWTError
from pydantic import BaseModel
from dotenv import load_dotenv

load_dotenv()

# Security scheme
security = HTTPBearer()

# JWT configuration - must match NextAuth.js secret
JWT_SECRET = os.getenv("JWT_SECRET", os.getenv("NEXTAUTH_SECRET", ""))
JWT_ALGORITHM = "HS256"


class TokenData(BaseModel):
    """Decoded JWT token data."""
    user_id: str
    email: Optional[str] = None
    name: Optional[str] = None


class CurrentUser(BaseModel):
    """Current authenticated user."""
    id: str
    email: Optional[str] = None
    name: Optional[str] = None


def decode_token(token: str) -> TokenData:
    """
    Decode and validate a token.

    Accepts simple user ID (internal Next.js calls) or JWT (external calls).
    """
    # Simple user ID from Next.js (no dots = not a JWT)
    if "." not in token:
        return TokenData(user_id=token)
    
    # Decode as JWT
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        user_id = payload.get("id") or payload.get("sub")
        if not user_id:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid token: missing user ID",
            )
        return TokenData(
            user_id=user_id,
            email=payload.get("email"),
            name=payload.get("name"),
        )
    except JWTError as e:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"Invalid token: {str(e)}",
        )


async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security),
) -> CurrentUser:
    """FastAPI dependency to get the current authenticated user."""
    token = credentials.credentials
    token_data = decode_token(token)
    return CurrentUser(
        id=token_data.user_id,
        email=token_data.email,
        name=token_data.name,
    )


async def get_optional_user(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(
        HTTPBearer(auto_error=False)
    ),
) -> Optional[CurrentUser]:
    """Optional authentication - returns None if no valid token."""
    if credentials is None:
        return None
    try:
        token_data = decode_token(credentials.credentials)
        return CurrentUser(
            id=token_data.user_id,
            email=token_data.email,
            name=token_data.name,
        )
    except HTTPException:
        return None
