from fastapi import FastAPI, Depends, HTTPException, status, File, UploadFile, Form
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import OAuth2PasswordRequestForm
from fastapi.staticfiles import StaticFiles
from sqlalchemy.orm import Session
import uvicorn
import os
import sys
from datetime import datetime
from typing import List, Optional
from google.oauth2 import id_token
from google.auth.transport import requests as google_requests
import json
import hashlib
from pywebpush import webpush, WebPushException
from apscheduler.schedulers.background import BackgroundScheduler

# Vercel deployment fix: add current directory to sys.path so it can find sibling modules 
# (auth, crud, models, etc.) even when invoked from the repository root.
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from component import models, auth, ai_service
from db import schemas, crud
from db.database import engine, get_db
from urllib.parse import quote

# Create all tables in the database
models.Base.metadata.create_all(bind=engine)

# Migration helper to add new columns to users table if they don't exist
from db.database import SessionLocal
from sqlalchemy import text
db_mig = SessionLocal()
try:
    res = db_mig.execute(text("SELECT column_name FROM information_schema.columns WHERE table_name='users' AND column_name='first_name'"))
    if not res.fetchone():
        print("Migrating users table: adding first_name, last_name, middle_initial columns...")
        # Add columns
        db_mig.execute(text("ALTER TABLE users ADD COLUMN first_name VARCHAR(100)"))
        db_mig.execute(text("ALTER TABLE users ADD COLUMN last_name VARCHAR(100)"))
        db_mig.execute(text("ALTER TABLE users ADD COLUMN middle_initial VARCHAR(10)"))
        db_mig.commit()
        
        # Populate columns from existing name column
        users_list = db_mig.execute(text("SELECT id, name FROM users")).fetchall()
        for u in users_list:
            uid, full_name = u
            if full_name:
                parts = full_name.split()
                fname = parts[0] if parts else ""
                lname = " ".join(parts[1:]) if len(parts) > 1 else ""
                db_mig.execute(
                    text("UPDATE users SET first_name=:fname, last_name=:lname WHERE id=:uid"),
                    {"fname": fname, "lname": lname, "uid": uid}
                )
        db_mig.commit()
except Exception as e:
    print(f"Migration warning (handled): {e}")
finally:
    db_mig.close()

# Migration helper to add image_url to food_analysis_cache if it doesn't exist
db_mig = SessionLocal()
try:
    res = db_mig.execute(text("SELECT column_name FROM information_schema.columns WHERE table_name='food_analysis_cache' AND column_name='image_url'"))
    if not res.fetchone():
        print("Migrating food_analysis_cache table: adding image_url column...")
        db_mig.execute(text("ALTER TABLE food_analysis_cache ADD COLUMN image_url VARCHAR(500)"))
        db_mig.commit()
except Exception as e:
    print(f"Migration warning (handled): {e}")
finally:
    db_mig.close()

# Migration helper to add food_text to food_analysis_cache and drop unique constraints
db_mig = SessionLocal()
try:
    res = db_mig.execute(text("SELECT column_name FROM information_schema.columns WHERE table_name='food_analysis_cache' AND column_name='food_text'"))
    if not res.fetchone():
        print("Migrating food_analysis_cache table: adding food_text column...")
        db_mig.execute(text("ALTER TABLE food_analysis_cache ADD COLUMN food_text TEXT DEFAULT ''"))
        db_mig.commit()
        
    # Drop unique constraint on image_hash so that same image can be cached with different descriptions
    db_mig.execute(text("ALTER TABLE food_analysis_cache DROP CONSTRAINT IF EXISTS food_analysis_cache_image_hash_key"))
    # Re-create simple non-unique index for performance
    db_mig.execute(text("CREATE INDEX IF NOT EXISTS ix_food_analysis_cache_image_hash ON food_analysis_cache(image_hash)"))
    db_mig.commit()
except Exception as e:
    print(f"Migration warning for food_text (handled): {e}")
finally:
    db_mig.close()

# Seed medical conditions if empty
db_seed = SessionLocal()
try:
    if db_seed.query(models.MedicalCondition).count() == 0:
        default_conditions = [
            models.MedicalCondition(name="Diabetes", description="A condition that affects how the body uses blood sugar."),
            models.MedicalCondition(name="Hypertension", description="High blood pressure."),
            models.MedicalCondition(name="Heart Disease", description="Various conditions affecting the heart."),
            models.MedicalCondition(name="Kidney Disease", description="Gradual loss of kidney function."),
            models.MedicalCondition(name="Celiac Disease", description="An immune reaction to eating gluten."),
            models.MedicalCondition(name="Asthma", description="A condition in which airways narrow and swell."),
            models.MedicalCondition(name="Obesity", description="A complex disease involving an excessive amount of body fat."),
            models.MedicalCondition(name="Lactose Intolerance", description="Inability to fully digest sugar (lactose) in dairy products.")
        ]
        db_seed.add_all(default_conditions)
        db_seed.commit()
except Exception as e:
    print(f"Seeding warning (handled): {e}")
finally:
    db_seed.close()

# --- WEB PUSH & SCHEDULER SETUP ---
VAPID_PUBLIC_KEY = os.getenv("VAPID_PUBLIC_KEY")
VAPID_PRIVATE_KEY = os.getenv("VAPID_PRIVATE_KEY")
VAPID_CLAIMS_EMAIL = os.getenv("VAPID_CLAIMS_EMAIL", "mailto:nutriai@example.com")

def send_scheduled_reminders():
    from db.database import SessionLocal
    from datetime import datetime, timedelta
    
    db = SessionLocal()
    try:
        # Get current time in PH timezone (UTC+8)
        current_ph_time = datetime.utcnow() + timedelta(hours=8)
        current_hour = current_ph_time.hour
        current_minute = current_ph_time.minute
        current_total_min = current_hour * 60 + current_minute
        
        subs = crud.get_all_push_subscriptions(db)
        if not subs:
            return
            
        from collections import defaultdict
        user_subs = defaultdict(list)
        for s in subs:
            user_subs[s.user_id].append(s)
            
        for user_id, subscriptions in user_subs.items():
            user = db.query(models.User).filter(models.User.id == user_id).first()
            if not user:
                continue
                
            # Compute smart reminders based on the user's meal times
            logs = crud.get_food_logs_by_user(db, user_id=user.id, limit=50)
            meal_times = {"Breakfast": [], "Lunch": [], "Dinner": []}
            for log in logs:
                if log.meal_type in meal_times:
                    hour_float = log.logged_at.hour + log.logged_at.minute / 60.0
                    meal_times[log.meal_type].append(hour_float)
            
            reminders = {}
            default_map = {"Breakfast": "08:00 AM", "Lunch": "12:30 PM", "Dinner": "07:00 PM"}
            for meal in ["Breakfast", "Lunch", "Dinner"]:
                times = meal_times[meal]
                if times:
                    avg_time = sum(times) / len(times)
                    h = int(avg_time)
                    m = int((avg_time - h) * 60)
                    ampm = "AM" if h < 12 else "PM"
                    display_h = h % 12
                    if display_h == 0:
                        display_h = 12
                    reminders[meal] = f"{display_h:02d}:{m:02d} {ampm}"
                else:
                    reminders[meal] = default_map[meal]
                    
            for meal, time_str in reminders.items():
                try:
                    parts = time_str.split()
                    if len(parts) != 2:
                        continue
                    time_part, ampm = parts[0], parts[1].upper()
                    hm = time_part.split(':')
                    if len(hm) != 2:
                        continue
                    h = int(hm[0])
                    m = int(hm[1])
                    if ampm == "PM" and h < 12:
                        h += 12
                    if ampm == "AM" and h == 12:
                        h = 0
                        
                    meal_total_min = h * 60 + m
                    diff_min = meal_total_min - current_total_min
                    
                    should_notify = False
                    message_body = ""
                    
                    if diff_min == 30:
                        should_notify = True
                        message_body = f"Your {meal} is in 30 minutes! Time to prepare. ⏳"
                    elif diff_min == 15:
                        should_notify = True
                        message_body = f"Your {meal} is in 15 minutes! Get ready. 🥗"
                    elif diff_min == 0:
                        should_notify = True
                        message_body = f"It's time for your {meal}! Don't forget to log it. 🍽️"
                        
                    if should_notify:
                        title = f"NutriAI {meal} Reminder"
                        payload = {
                            "title": title,
                            "body": message_body,
                            "url": "/index.html"
                        }
                        for sub in subscriptions:
                            try:
                                webpush(
                                    subscription_info={
                                        "endpoint": sub.endpoint,
                                        "keys": {
                                            "p256dh": sub.p256dh_key,
                                            "auth": sub.auth_key
                                        }
                                    },
                                    data=json.dumps(payload),
                                    vapid_private_key=VAPID_PRIVATE_KEY,
                                    vapid_claims={"sub": VAPID_CLAIMS_EMAIL},
                                    ttl=3600
                                )
                            except WebPushException as ex:
                                print(f"WebPushException for sub {sub.id}: {ex}")
                                if ex.response is not None and ex.response.status_code in [404, 410]:
                                    crud.delete_push_subscription(db, sub.endpoint)
                            except Exception as e:
                                print(f"Failed to send push: {e}")
                except Exception as e:
                    print(f"Error checking reminder for user {user.id}, meal {meal}: {e}")
    except Exception as e:
        print(f"Scheduler execution error: {e}")
    finally:
        db.close()

# Start scheduler
scheduler = BackgroundScheduler(timezone="Asia/Manila")
scheduler.add_job(send_scheduled_reminders, 'cron', minute='*')
scheduler.start()

app = FastAPI(
    title="NutriAI Backend API",
    description="Backend services for the NutriAI Thesis Project",
    version="1.0.0"
)

# Allow frontend to communicate with backend
origins = ["*"]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/api")
def root():
    return {"message": "NutriAI Backend is running!"}

@app.get("/api/medical-conditions", response_model=List[schemas.MedicalConditionResponse])
def get_medical_conditions(db: Session = Depends(get_db)):
    return crud.get_medical_conditions(db)

# --- AUTH AND USERS ---
@app.post("/api/users/", response_model=schemas.UserResponse)
def register_user(user: schemas.UserCreate, db: Session = Depends(get_db)):
    db_user = crud.get_user_by_email(db, email=user.email)
    if db_user:
        raise HTTPException(status_code=400, detail="Email already registered")
    
    if not auth.validate_password_strength(user.password):
        raise HTTPException(
            status_code=400,
            detail="Password is too weak. It must be at least 8 characters long, contain an uppercase letter, a lowercase letter, a number, and a special character."
        )
        
    return crud.create_user(db=db, user=user)

@app.post("/api/login", response_model=schemas.Token)
def login_for_access_token(form_data: OAuth2PasswordRequestForm = Depends(), db: Session = Depends(get_db)):
    user = crud.get_user_by_email(db, email=form_data.username)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Account not found. Please sign up first.",
            headers={"WWW-Authenticate": "Bearer"},
        )
    if not crud.verify_password(form_data.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect credentials",
            headers={"WWW-Authenticate": "Bearer"},
        )
    access_token = auth.create_access_token(data={"sub": user.email})
    return {"access_token": access_token, "token_type": "bearer"}

@app.post("/api/auth/google", response_model=schemas.Token)
def login_google(token_request: schemas.GoogleToken, db: Session = Depends(get_db)):
    try:
        client_id = os.getenv("GOOGLE_CLIENT_ID")
        
        # Verify the token
        id_info = id_token.verify_oauth2_token(
            token_request.token, 
            google_requests.Request(), 
            client_id,
            clock_skew_in_seconds=10
        )
        
        email = id_info.get("email")
        name = id_info.get("name", "Google User")
        
        if not email:
            raise HTTPException(status_code=400, detail="No email provided by Google")
            
        user = crud.get_user_by_email(db, email=email)
        if not user:
            if not token_request.is_register:
                raise HTTPException(status_code=404, detail="Account not found. Please sign up first.")
                
            # Split full name into first and last name
            name_parts = name.split()
            first_name = name_parts[0] if name_parts else "Google"
            last_name = " ".join(name_parts[1:]) if len(name_parts) > 1 else "User"
            middle_initial = None
            
            # Create a dummy password since they use Google
            import secrets
            import string
            alphabet = string.ascii_letters + string.digits + "!@#$%^&*"
            dummy_pw = ''.join(secrets.choice(alphabet) for i in range(20))
            
            user_create = schemas.UserCreate(
                email=email,
                first_name=first_name,
                last_name=last_name,
                middle_initial=middle_initial,
                password=dummy_pw
            )
            user = crud.create_user(db=db, user=user_create)
            
        access_token = auth.create_access_token(data={"sub": user.email})
        return {"access_token": access_token, "token_type": "bearer"}
        
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=f"Invalid Google token: {str(e)}")

@app.get("/api/auth/google-client-id")
def get_google_client_id():
    return {"client_id": os.getenv("GOOGLE_CLIENT_ID")}

@app.get("/api/users/me", response_model=schemas.UserResponse)
def read_users_me(current_user: models.User = Depends(auth.get_current_user)):
    return current_user

@app.put("/api/users/me/update", response_model=schemas.UserResponse)
def update_user_info(user_update: schemas.UserUpdate, current_user: models.User = Depends(auth.get_current_user), db: Session = Depends(get_db)):
    if user_update.email:
        # check if new email is already taken
        existing_user = crud.get_user_by_email(db, email=user_update.email)
        if existing_user and existing_user.id != current_user.id:
            raise HTTPException(status_code=400, detail="Email already registered")
            
    updated_user = crud.update_user(db, user_id=current_user.id, user_update=user_update)
    return updated_user

@app.put("/api/users/me/password")
def update_password(pw_update: schemas.UserPasswordUpdate, current_user: models.User = Depends(auth.get_current_user), db: Session = Depends(get_db)):
    if not crud.verify_password(pw_update.current_password, current_user.hashed_password):
        raise HTTPException(status_code=400, detail="Incorrect current password")
        
    if not auth.validate_password_strength(pw_update.new_password):
        raise HTTPException(
            status_code=400,
            detail="Password is too weak. It must be at least 8 characters long, contain an uppercase letter, a lowercase letter, a number, and a special character."
        )
        
    crud.update_user_password(db, user_id=current_user.id, new_password=pw_update.new_password)
    return {"message": "Password updated successfully"}

class ForgotPasswordRequest(schemas.BaseModel):
    email: str
    new_password: str

@app.post("/api/forgot-password")
def forgot_password_immidiate_reset(request: ForgotPasswordRequest, db: Session = Depends(get_db)):
    user = crud.get_user_by_email(db, email=request.email)
    if not user:
        raise HTTPException(status_code=404, detail="Email not found")
        
    if not auth.validate_password_strength(request.new_password):
        raise HTTPException(
            status_code=400,
            detail="Password is too weak. It must be at least 8 characters long, contain an uppercase letter, a lowercase letter, a number, and a special character."
        )
        
    crud.update_user_password(db, user_id=user.id, new_password=request.new_password)
    return {"message": "Password reset successfully"}

@app.delete("/api/users/me")
def delete_user_account(current_user: models.User = Depends(auth.get_current_user), db: Session = Depends(get_db)):
    # Delete DB records and retrieve orphaned Vercel Blob URLs
    image_urls = crud.delete_user_data(db, user_id=current_user.id)
    
    # Cleanup blobs
    if image_urls:
        blob_token = os.environ.get("BLOB_READ_WRITE_TOKEN")
        if blob_token:
            import requests
            headers = {
                "Authorization": f"Bearer {blob_token}",
                "Content-Type": "application/json"
            }
            try:
                # Call the Vercel REST API delete endpoint directly instead of the SDK
                requests.post(
                    "https://blob.vercel-storage.com/delete",
                    json={"urls": image_urls},
                    headers=headers
                )
            except Exception as e:
                # Silent fail for the user; the database is safely deleted
                print(f"Non-critical cleanup failure: {e}")
                
    return {"message": "Account successfully deleted."}

# --- MEDICAL PROFILE (SMART ONBOARDING) ---
@app.post("/api/profile/", response_model=schemas.MedicalProfileResponse)
def update_profile(profile: schemas.MedicalProfileCreate, current_user: models.User = Depends(auth.get_current_user), db: Session = Depends(get_db)):
    return crud.create_or_update_profile(db, user_id=current_user.id, profile=profile)

@app.get("/api/profile/", response_model=schemas.MedicalProfileResponse)
def read_profile(current_user: models.User = Depends(auth.get_current_user), db: Session = Depends(get_db)):
    db_profile = crud.get_medical_profile(db, user_id=current_user.id)
    if db_profile is None:
        raise HTTPException(status_code=404, detail="Profile not found")
    return db_profile

# --- WEIGHT HISTORY ---
@app.post("/api/weight/", response_model=schemas.WeightHistoryResponse)
def log_weight(weight: schemas.WeightHistoryCreate, current_user: models.User = Depends(auth.get_current_user), db: Session = Depends(get_db)):
    return crud.add_weight_log(db, user_id=current_user.id, weight=weight)

@app.get("/api/weight/", response_model=List[schemas.WeightHistoryResponse])
def get_weight(limit: int = 30, current_user: models.User = Depends(auth.get_current_user), db: Session = Depends(get_db)):
    return crud.get_weight_history(db, user_id=current_user.id, limit=limit)

# --- FOOD LOGGING ---
@app.post("/api/logs/", response_model=schemas.FoodLogResponse)
def log_food(food: schemas.FoodLogCreate, current_user: models.User = Depends(auth.get_current_user), db: Session = Depends(get_db)):
    return crud.create_food_log(db, user_id=current_user.id, food=food)

@app.get("/api/logs/", response_model=List[schemas.FoodLogResponse])
def get_logs(limit: int = 100, date: Optional[str] = None, current_user: models.User = Depends(auth.get_current_user), db: Session = Depends(get_db)):
    return crud.get_food_logs_by_user(db, user_id=current_user.id, limit=limit, date_str=date)

# --- AI INTEGRATION ---
@app.post("/api/ai/analyze-food")
async def analyze_food(
    food_text: Optional[str] = Form(None),
    image: Optional[UploadFile] = File(None),
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(get_db)
):
    db_profile = crud.get_medical_profile(db, user_id=current_user.id)
    
    medical_data = None
    if db_profile:
        medical_data = {
            "illnesses": db_profile.illnesses,
            "allergies": db_profile.allergies
        }
    
    image_bytes = None
    mime_type = None
    image_url = None
    image_hash = None
    
    if image:
        image_bytes = await image.read()
        mime_type = image.content_type
        # Generate SHA-256 hash of image for cache lookup
        image_hash = hashlib.sha256(image_bytes).hexdigest()
    elif food_text:
        # Generate a pseudo-hash from food_text for text-only caching (must fit 64-character limit)
        image_hash = hashlib.sha256(food_text.strip().lower().encode("utf-8")).hexdigest()
        
    if image_hash:
        # Check cache first — if this exact input was analyzed before, return cached result
        cached = crud.get_cached_analysis(db, image_hash=image_hash, food_text=food_text)
        if cached:
            print(f"Cache HIT for hash {image_hash[:12]}... Skipping Gemini API call.")
            analysis = {
                "food_name": cached.food_name,
                "calories": cached.calories,
                "protein_g": cached.protein_g,
                "carbs_g": cached.carbs_g,
                "fat_g": cached.fat_g,
                "vitamin_c_mg": cached.vitamin_c_mg,
                "calcium_mg": cached.calcium_mg,
                "iron_mg": cached.iron_mg,
                "caution_warning": cached.caution_warning,
                "image_url": cached.image_url,
                "cached": True
            }
            return analysis

    if image:
        # Prepare Vercel Blob upload filename
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        safe_filename = "".join([c for c in image.filename if c.isalpha() or c.isdigit() or c in (' ', '.', '_', '-')]).rstrip()
        filename = f"{timestamp}_{safe_filename}" if safe_filename else f"{timestamp}_upload.jpg"
        
        # Pull token from environment
        blob_token = os.environ.get("BLOB_READ_WRITE_TOKEN")
        if not blob_token:
            raise HTTPException(status_code=500, detail="Vercel Blob storage not configured. Missing BLOB_READ_WRITE_TOKEN.")
            
        import requests
        
        # Ensure path contains absolutely no spaces or special non-URL chars
        blob_path = f"food_logs/{current_user.id}/{filename}".replace("-", "_")
        
        headers = {
            "Authorization": f"Bearer {blob_token}",
            "Content-Type": mime_type if mime_type else "image/jpeg",
        }
        
        res = requests.put(
            url = f"https://blob.vercel-storage.com/{blob_path}",
            data=image_bytes, 
            headers=headers
        )
        
        if res.status_code != 200:
            print("Vercel Blob Upload Error:", res.status_code, res.text)
            raise HTTPException(status_code=500, detail="Failed to upload image to Vercel Blob.")
            
        # URL path that will be stored securely in db
        image_url = res.json().get("url")
        
    analysis = ai_service.analyze_food_multimodal(
        food_text=food_text, 
        image_bytes=image_bytes, 
        mime_type=mime_type, 
        medical_profile=medical_data
    )
    
    # Cache the result if this was an image analysis
    if image_hash and analysis.get("food_name") != "Error Processing":
        try:
            crud.save_cached_analysis(db, image_hash=image_hash, analysis=analysis, food_text=food_text, image_url=image_url)
            print(f"Cache SAVED for image hash {image_hash[:12]}...")
        except Exception as e:
            print(f"Cache save warning (non-critical): {e}")
    
    # Inject image_url so frontend can capture it and send it to POST /logs/
    analysis["image_url"] = image_url
    
    return analysis

@app.get("/api/ai/reminders")
def get_smart_reminders(current_user: models.User = Depends(auth.get_current_user), db: Session = Depends(get_db)):
    """
    Behavioral Pattern Learner: analyzes previous log times to recommend when to send reminders.
    """
    logs = crud.get_food_logs_by_user(db, user_id=current_user.id, limit=50)
    
    if not logs:
         return {
             "Breakfast": "08:00 AM",
             "Lunch": "12:30 PM",
             "Dinner": "07:00 PM"
         }
         
    meal_times = {"Breakfast": [], "Lunch": [], "Dinner": []}
    for log in logs:
        if log.meal_type in meal_times:
            # We want just the time component
            hour_float = log.logged_at.hour + log.logged_at.minute / 60.0
            meal_times[log.meal_type].append(hour_float)
            
    reminders = {}
    for meal, times in meal_times.items():
        if times:
            avg_time = sum(times) / len(times)
            hour = int(avg_time)
            minute = int((avg_time - hour) * 60)
            ampm = "AM" if hour < 12 else "PM"
            
            display_hour = hour % 12
            if display_hour == 0:
                display_hour = 12
                
            reminders[meal] = f"{display_hour:02d}:{minute:02d} {ampm}"
        else:
            default_map = {"Breakfast": "08:00 AM", "Lunch": "12:30 PM", "Dinner": "07:00 PM"}
            reminders[meal] = default_map[meal]
            
    return reminders

# --- WEB PUSH ENDPOINTS ---
@app.post("/api/push/subscribe")
def subscribe_push(sub: schemas.PushSubscriptionCreate, current_user: models.User = Depends(auth.get_current_user), db: Session = Depends(get_db)):
    db_sub = crud.save_push_subscription(db, user_id=current_user.id, sub_in=sub)
    return {"status": "success", "subscription_id": db_sub.id}

@app.delete("/api/push/unsubscribe")
def unsubscribe_push(endpoint: str, current_user: models.User = Depends(auth.get_current_user), db: Session = Depends(get_db)):
    crud.delete_push_subscription(db, endpoint=endpoint)
    return {"status": "success"}

@app.get("/api/push/public-key")
def get_vapid_public_key():
    return {"public_key": VAPID_PUBLIC_KEY}

@app.post("/api/push/test")
def test_push_notification(current_user: models.User = Depends(auth.get_current_user), db: Session = Depends(get_db)):
    subs = crud.get_push_subscriptions_for_user(db, user_id=current_user.id)
    if not subs:
        raise HTTPException(status_code=400, detail="No active push subscriptions found for this user.")
        
    payload = {
        "title": "NutriAI Test Notification",
        "body": "It works! Push notifications are successfully configured. 🎉",
        "url": "/index.html"
    }
    
    sent_count = 0
    for sub in subs:
        try:
            webpush(
                subscription_info={
                    "endpoint": sub.endpoint,
                    "keys": {
                        "p256dh": sub.p256dh_key,
                        "auth": sub.auth_key
                    }
                },
                data=json.dumps(payload),
                vapid_private_key=VAPID_PRIVATE_KEY,
                vapid_claims={"sub": VAPID_CLAIMS_EMAIL},
                ttl=3600
            )
            sent_count += 1
        except WebPushException as ex:
            print(f"Test WebPushException for sub {sub.id}: {ex}")
            if ex.response is not None and ex.response.status_code in [404, 410]:
                crud.delete_push_subscription(db, sub.endpoint)
        except Exception as e:
            print(f"Failed to send test push: {e}")
            
    return {"status": "success", "sent_count": sent_count}

@app.get("/api/push/cron")
def push_cron_trigger():
    """Trigger scheduled reminder checks (useful for serverless environments like Vercel)."""
    send_scheduled_reminders()
    return {"status": "success", "message": "Scheduled reminder check triggered successfully."}

@app.on_event("startup")
def startup_event():
    # Eagerly initialize OCR engine on server startup to avoid lag on first request
    try:
        from component.ai_service import init_ocr_engine
        init_ocr_engine()
    except Exception as e:
        print(f"Startup warning: Failed to initialize OCR engine on startup: {e}")

@app.on_event("shutdown")
def shutdown_event():
    scheduler.shutdown()

if __name__ == "__main__":
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
