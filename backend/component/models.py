from sqlalchemy import Boolean, Column, ForeignKey, Integer, String, Float, DateTime, Text
from sqlalchemy.orm import relationship
from datetime import datetime, timedelta
import uuid
from db.database import Base

def get_ph_time():
    return datetime.utcnow() + timedelta(hours=8)

class User(Base):
    __tablename__ = "users"

    id = Column(String(36), primary_key=True, index=True, default=lambda: str(uuid.uuid4()))
    email = Column(String(255), unique=True, index=True) # specified length for mysql
    hashed_password = Column(String(255))
    name = Column(String(100))
    created_at = Column(DateTime, default=get_ph_time)

    profile = relationship("MedicalProfile", back_populates="user", uselist=False)
    logs = relationship("FoodLog", back_populates="user")
    weight_history = relationship("WeightHistory", back_populates="user")

class MedicalProfile(Base):
    """
    Stores the Smart Onboarding and Medical caution data
    """
    __tablename__ = "medical_profiles"

    id = Column(String(36), primary_key=True, index=True, default=lambda: str(uuid.uuid4()))
    user_id = Column(String(36), ForeignKey("users.id"))
    
    # Body Goals
    height_cm = Column(Float)
    weight_kg = Column(Float)
    target_weight_kg = Column(Float)
    bmi = Column(Float)
    
    # Medical Profile Builder
    illnesses = Column(Text) # Comma separated list e.g. "Diabetes, Hypertension"
    allergies = Column(Text) # Comma separated list e.g. "Peanuts, Shellfish"
    
    # Needs
    daily_calorie_goal = Column(Integer)
    
    user = relationship("User", back_populates="profile")

class FoodLog(Base):
    __tablename__ = "food_logs"

    id = Column(String(36), primary_key=True, index=True, default=lambda: str(uuid.uuid4()))
    user_id = Column(String(36), ForeignKey("users.id"))
    
    meal_type = Column(String(50)) # Breakfast, Lunch, Dinner, Snack
    food_name = Column(String(255))
    
    calories = Column(Integer)
    protein_g = Column(Float)
    carbs_g = Column(Float)
    fat_g = Column(Float)
    
    # Micronutrients (Cronometer style)
    vitamin_c_mg = Column(Float, default=0.0)
    calcium_mg = Column(Float, default=0.0)
    iron_mg = Column(Float, default=0.0)
    
    # For multimodal references
    image_url = Column(String(500), nullable=True) 
    medical_caution = Column(Text, nullable=True)
    
    logged_at = Column(DateTime, default=get_ph_time)

    user = relationship("User", back_populates="logs")

class WeightHistory(Base):
    __tablename__ = "weight_history"

    id = Column(String(36), primary_key=True, index=True, default=lambda: str(uuid.uuid4()))
    user_id = Column(String(36), ForeignKey("users.id"))
    weight_kg = Column(Float)
    logged_at = Column(DateTime, default=get_ph_time)

    user = relationship("User", back_populates="weight_history")
