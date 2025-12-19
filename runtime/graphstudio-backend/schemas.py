from pydantic import BaseModel, EmailStr
from datetime import datetime
from typing import Optional

# Token schemas
class Token(BaseModel):
    access_token: str
    token_type: str

class TokenData(BaseModel):
    email: Optional[str] = None

# User schemas
class UserBase(BaseModel):
    email: EmailStr
    full_name: Optional[str] = None

class UserCreate(UserBase):
    password: str

class User(UserBase):
    id: str
    is_active: bool
    created_at: datetime
    subscription: Optional["Subscription"] = None

    class Config:
        from_attributes = True

# Subscription schemas
class SubscriptionBase(BaseModel):
    plan_name: str

class Subscription(SubscriptionBase):
    id: str
    user_id: str
    is_active: bool
    start_date: datetime
    end_date: Optional[datetime] = None

    class Config:
        from_attributes = True

# Update forward references
User.model_rebuild()
