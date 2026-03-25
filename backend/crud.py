from sqlalchemy.orm import Session
from passlib.context import CryptContext
from datetime import datetime, timedelta
import models, schemas

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

def get_password_hash(password):
    return pwd_context.hash(password)

def verify_password(plain_password, hashed_password):
    return pwd_context.verify(plain_password, hashed_password)

# --- USER CRUD ---
def get_user_by_email(db: Session, email: str):
    return db.query(models.User).filter(models.User.email == email).first()

def create_user(db: Session, user: schemas.UserCreate):
    hashed_password = get_password_hash(user.password)
    db_user = models.User(email=user.email, name=user.name, hashed_password=hashed_password)
    db.add(db_user)
    db.commit()
    db.refresh(db_user)
    return db_user

def update_user(db: Session, user_id: str, user_update: schemas.UserUpdate):
    db_user = db.query(models.User).filter(models.User.id == user_id).first()
    if not db_user:
        return None
    
    if user_update.name is not None:
        db_user.name = user_update.name
    if user_update.email is not None:
        db_user.email = user_update.email
        
    db.commit()
    db.refresh(db_user)
    return db_user

def update_user_password(db: Session, user_id: str, new_password: str):
    db_user = db.query(models.User).filter(models.User.id == user_id).first()
    if not db_user:
        return None
        
    db_user.hashed_password = get_password_hash(new_password)
    db.commit()
    return db_user

# --- MEDICAL PROFILE CRUD ---
def calculate_bmi(weight_kg, height_cm):
    height_m = height_cm / 100
    if height_m <= 0: return 0
    return round(weight_kg / (height_m * height_m), 2)

def calculate_daily_calories(weight_kg, height_cm, target_weight_kg):
    # A simplified BMR calculation + goal adjustment
    bmr = 10 * weight_kg + 6.25 * height_cm - 5 * 25 + 5 # male average baseline
    
    # Simple logic for goals
    if target_weight_kg < weight_kg:
        return int(bmr * 1.2 - 500) # Weight loss
    elif target_weight_kg > weight_kg:
        return int(bmr * 1.2 + 500) # Muscle gain
    return int(bmr * 1.2) # Maintenance

def create_or_update_profile(db: Session, user_id: str, profile: schemas.MedicalProfileCreate):
    db_profile = db.query(models.MedicalProfile).filter(models.MedicalProfile.user_id == user_id).first()
    
    bmi = calculate_bmi(profile.weight_kg, profile.height_cm)
    daily_cals = calculate_daily_calories(profile.weight_kg, profile.height_cm, profile.target_weight_kg)
    
    if db_profile:
        # Update
        for key, value in profile.dict().items():
            setattr(db_profile, key, value)
        db_profile.bmi = bmi
        db_profile.daily_calorie_goal = daily_cals
    else:
        # Create
        db_profile = models.MedicalProfile(
            **profile.dict(), 
            user_id=user_id,
            bmi=bmi,
            daily_calorie_goal=daily_cals
        )
        db.add(db_profile)
        
    db.commit()
    db.refresh(db_profile)
    return db_profile

def get_medical_profile(db: Session, user_id: str):
    return db.query(models.MedicalProfile).filter(models.MedicalProfile.user_id == user_id).first()

# --- FOOD LOG CRUD ---
def create_food_log(db: Session, user_id: str, food: schemas.FoodLogCreate):
    db_log = models.FoodLog(**food.dict(), user_id=user_id)
    db.add(db_log)
    db.commit()
    db.refresh(db_log)
    return db_log

def get_food_logs_by_user(db: Session, user_id: str, limit: int = 100, date_str: str = None):
    query = db.query(models.FoodLog).filter(models.FoodLog.user_id == user_id)
    
    if date_str:
        try:
            # Assumes YYYY-MM-DD format
            target_date = datetime.strptime(date_str, "%Y-%m-%d").date()
            start_dt = datetime.combine(target_date, datetime.min.time())
            end_dt = start_dt + timedelta(days=1)
            query = query.filter(models.FoodLog.logged_at >= start_dt, models.FoodLog.logged_at < end_dt)
        except ValueError:
            pass # Use default query if parsing fails
            
    return query.order_by(models.FoodLog.logged_at.desc()).limit(limit).all()

# --- WEIGHT HISTORY CRUD ---
def add_weight_log(db: Session, user_id: str, weight: schemas.WeightHistoryCreate):
    db_log = models.WeightHistory(**weight.dict(), user_id=user_id)
    db.add(db_log)
    
    # Also update current weight in profile if it exists
    profile = get_medical_profile(db, user_id=user_id)
    if profile:
        profile.weight_kg = weight.weight_kg
        profile.bmi = calculate_bmi(profile.weight_kg, profile.height_cm)
        profile.daily_calorie_goal = calculate_daily_calories(profile.weight_kg, profile.height_cm, profile.target_weight_kg)
        
    db.commit()
    db.refresh(db_log)
    return db_log

def get_weight_history(db: Session, user_id: str, limit: int = 30):
    return db.query(models.WeightHistory).filter(models.WeightHistory.user_id == user_id).order_by(models.WeightHistory.logged_at.asc()).limit(limit).all()

# --- PROFILE DELETION ---
def delete_user_data(db: Session, user_id: str):
    """
    Safely deletes the user and all associated records, returning Vercel Blob URLs for cleanup.
    """
    # 1. Fetch logs securely to collect blob URLs
    logs = db.query(models.FoodLog).filter(models.FoodLog.user_id == user_id).all()
    image_urls = [log.image_url for log in logs if log.image_url and log.image_url.startswith("http")]
    
    # 2. Hard delete all child dependencies explicitly
    db.query(models.FoodLog).filter(models.FoodLog.user_id == user_id).delete(synchronize_session=False)
    db.query(models.WeightHistory).filter(models.WeightHistory.user_id == user_id).delete(synchronize_session=False)
    db.query(models.MedicalProfile).filter(models.MedicalProfile.user_id == user_id).delete(synchronize_session=False)
    
    # 3. Hard delete the root user record
    db.query(models.User).filter(models.User.id == user_id).delete(synchronize_session=False)
    
    # 4. Commit transaction
    db.commit()
    
    return image_urls
