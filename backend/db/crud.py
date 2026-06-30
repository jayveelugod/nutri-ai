from sqlalchemy.orm import Session
from passlib.context import CryptContext
from datetime import datetime, timedelta
from component import models
from db import schemas

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
    db_user = models.User(
        email=user.email,
        first_name=user.first_name,
        last_name=user.last_name,
        middle_initial=user.middle_initial,
        hashed_password=hashed_password
    )
    db.add(db_user)
    db.commit()
    db.refresh(db_user)
    return db_user

def update_user(db: Session, user_id: str, user_update: schemas.UserUpdate):
    db_user = db.query(models.User).filter(models.User.id == user_id).first()
    if not db_user:
        return None
    
    if user_update.first_name is not None:
        db_user.first_name = user_update.first_name
    if user_update.last_name is not None:
        db_user.last_name = user_update.last_name
    if user_update.middle_initial is not None:
        db_user.middle_initial = user_update.middle_initial
    if user_update.email is not None:
        db_user.email = user_update.email
        
    db.commit()
    db.refresh(db_user)
    return db_user

def get_medical_conditions(db: Session):
    return db.query(models.MedicalCondition).order_by(models.MedicalCondition.name).all()

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
    db.query(models.PushSubscription).filter(models.PushSubscription.user_id == user_id).delete(synchronize_session=False)
    
    # 3. Hard delete the root user record
    db.query(models.User).filter(models.User.id == user_id).delete(synchronize_session=False)
    
    # 4. Commit transaction
    db.commit()
    
    return image_urls

# --- PUSH SUBSCRIPTIONS CRUD ---
def save_push_subscription(db: Session, user_id: str, sub_in: schemas.PushSubscriptionCreate):
    # Check if this endpoint is already registered (can be by the same or a different user)
    db_sub = db.query(models.PushSubscription).filter(models.PushSubscription.endpoint == sub_in.endpoint).first()
    if db_sub:
        db_sub.user_id = user_id
        db_sub.p256dh_key = sub_in.p256dh
        db_sub.auth_key = sub_in.auth
    else:
        db_sub = models.PushSubscription(
            user_id=user_id,
            endpoint=sub_in.endpoint,
            p256dh_key=sub_in.p256dh,
            auth_key=sub_in.auth
        )
        db.add(db_sub)
    db.commit()
    db.refresh(db_sub)
    return db_sub

def delete_push_subscription(db: Session, endpoint: str):
    db.query(models.PushSubscription).filter(models.PushSubscription.endpoint == endpoint).delete(synchronize_session=False)
    db.commit()

def get_push_subscriptions_for_user(db: Session, user_id: str):
    return db.query(models.PushSubscription).filter(models.PushSubscription.user_id == user_id).all()

def get_all_push_subscriptions(db: Session):
    return db.query(models.PushSubscription).all()

# --- FOOD ANALYSIS CACHE CRUD ---
def get_cached_analysis(db: Session, image_hash: str, food_text: str = None):
    normalized_text = (food_text or "").strip()
    return db.query(models.FoodAnalysisCache).filter(
        models.FoodAnalysisCache.image_hash == image_hash,
        models.FoodAnalysisCache.food_text == normalized_text
    ).first()

def save_cached_analysis(db: Session, image_hash: str, analysis: dict, food_text: str = None, image_url: str = None):
    normalized_text = (food_text or "").strip()
    db_cache = models.FoodAnalysisCache(
        image_hash=image_hash,
        food_text=normalized_text,
        food_name=analysis.get("food_name"),
        calories=analysis.get("calories", 0),
        protein_g=analysis.get("protein_g", 0.0),
        carbs_g=analysis.get("carbs_g", 0.0),
        fat_g=analysis.get("fat_g", 0.0),
        vitamin_c_mg=analysis.get("vitamin_c_mg", 0.0),
        calcium_mg=analysis.get("calcium_mg", 0.0),
        iron_mg=analysis.get("iron_mg", 0.0),
        caution_warning=analysis.get("caution_warning"),
        image_url=image_url
    )
    db.add(db_cache)
    db.commit()
    db.refresh(db_cache)
    return db_cache
