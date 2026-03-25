from pydantic import BaseModel, EmailStr
from typing import Optional, List
from datetime import datetime

# AUTH SCHEMAS
class Token(BaseModel):
    access_token: str
    token_type: str

class TokenData(BaseModel):
    email: Optional[str] = None

# USER SCHEMAS
class UserBase(BaseModel):
    email: EmailStr
    name: str

class UserCreate(UserBase):
    password: str

class UserResponse(UserBase):
    id: str
    created_at: datetime
    
    class Config:
        orm_mode = True

class UserUpdate(BaseModel):
    name: Optional[str] = None
    email: Optional[EmailStr] = None

class UserPasswordUpdate(BaseModel):
    current_password: str
    new_password: str

# PROFILE SCHEMAS
class MedicalProfileBase(BaseModel):
    height_cm: float
    weight_kg: float
    target_weight_kg: float
    illnesses: Optional[str] = None
    allergies: Optional[str] = None

class MedicalProfileCreate(MedicalProfileBase):
    pass

class MedicalProfileResponse(MedicalProfileBase):
    id: str
    user_id: str
    bmi: float
    daily_calorie_goal: int
    
    class Config:
        orm_mode = True

# FOOD LOG SCHEMAS
class FoodLogBase(BaseModel):
    meal_type: str
    food_name: str
    calories: int
    protein_g: float
    carbs_g: float
    fat_g: float
    vitamin_c_mg: Optional[float] = 0.0
    calcium_mg: Optional[float] = 0.0
    iron_mg: Optional[float] = 0.0
    image_url: Optional[str] = None
    medical_caution: Optional[str] = None

class FoodLogCreate(FoodLogBase):
    pass

class FoodLogResponse(FoodLogBase):
    id: str
    user_id: str
    logged_at: datetime
    
    class Config:
        from_attributes = True

# WEIGHT HISTORY SCHEMAS
class WeightHistoryBase(BaseModel):
    weight_kg: float

class WeightHistoryCreate(WeightHistoryBase):
    pass

class WeightHistoryResponse(WeightHistoryBase):
    id: str
    user_id: str
    logged_at: datetime

    class Config:
        from_attributes = True
