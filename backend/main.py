from fastapi import FastAPI, Depends, HTTPException, status, File, UploadFile, Form
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import OAuth2PasswordRequestForm
from fastapi.staticfiles import StaticFiles
from sqlalchemy.orm import Session
import uvicorn
import os
from datetime import datetime
from typing import List, Optional

import models
import schemas
import crud
import auth
import ai_service
from database import engine, get_db
from urllib.parse import quote

# Create all tables in the database
models.Base.metadata.create_all(bind=engine)

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

@app.get("/")
def root():
    return {"message": "NutriAI Backend is running!"}

# --- AUTH AND USERS ---
@app.post("/users/", response_model=schemas.UserResponse)
def register_user(user: schemas.UserCreate, db: Session = Depends(get_db)):
    db_user = crud.get_user_by_email(db, email=user.email)
    if db_user:
        raise HTTPException(status_code=400, detail="Email already registered")
    return crud.create_user(db=db, user=user)

@app.post("/login", response_model=schemas.Token)
def login_for_access_token(form_data: OAuth2PasswordRequestForm = Depends(), db: Session = Depends(get_db)):
    user = crud.get_user_by_email(db, email=form_data.username)
    if not user or not crud.verify_password(form_data.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    access_token = auth.create_access_token(data={"sub": user.email})
    return {"access_token": access_token, "token_type": "bearer"}

@app.get("/users/me", response_model=schemas.UserResponse)
def read_users_me(current_user: models.User = Depends(auth.get_current_user)):
    return current_user

@app.put("/users/me/update", response_model=schemas.UserResponse)
def update_user_info(user_update: schemas.UserUpdate, current_user: models.User = Depends(auth.get_current_user), db: Session = Depends(get_db)):
    if user_update.email:
        # check if new email is already taken
        existing_user = crud.get_user_by_email(db, email=user_update.email)
        if existing_user and existing_user.id != current_user.id:
            raise HTTPException(status_code=400, detail="Email already registered")
            
    updated_user = crud.update_user(db, user_id=current_user.id, user_update=user_update)
    return updated_user

@app.put("/users/me/password")
def update_password(pw_update: schemas.UserPasswordUpdate, current_user: models.User = Depends(auth.get_current_user), db: Session = Depends(get_db)):
    if not crud.verify_password(pw_update.current_password, current_user.hashed_password):
        raise HTTPException(status_code=400, detail="Incorrect current password")
        
    crud.update_user_password(db, user_id=current_user.id, new_password=pw_update.new_password)
    return {"message": "Password updated successfully"}

class ForgotPasswordRequest(schemas.BaseModel):
    email: str
    new_password: str

@app.post("/forgot-password")
def forgot_password_immidiate_reset(request: ForgotPasswordRequest, db: Session = Depends(get_db)):
    user = crud.get_user_by_email(db, email=request.email)
    if not user:
        raise HTTPException(status_code=404, detail="Email not found")
        
    crud.update_user_password(db, user_id=user.id, new_password=request.new_password)
    return {"message": "Password reset successfully"}

@app.delete("/users/me")
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
@app.post("/profile/", response_model=schemas.MedicalProfileResponse)
def update_profile(profile: schemas.MedicalProfileCreate, current_user: models.User = Depends(auth.get_current_user), db: Session = Depends(get_db)):
    return crud.create_or_update_profile(db, user_id=current_user.id, profile=profile)

@app.get("/profile/", response_model=schemas.MedicalProfileResponse)
def read_profile(current_user: models.User = Depends(auth.get_current_user), db: Session = Depends(get_db)):
    db_profile = crud.get_medical_profile(db, user_id=current_user.id)
    if db_profile is None:
        raise HTTPException(status_code=404, detail="Profile not found")
    return db_profile

# --- WEIGHT HISTORY ---
@app.post("/weight/", response_model=schemas.WeightHistoryResponse)
def log_weight(weight: schemas.WeightHistoryCreate, current_user: models.User = Depends(auth.get_current_user), db: Session = Depends(get_db)):
    return crud.add_weight_log(db, user_id=current_user.id, weight=weight)

@app.get("/weight/", response_model=List[schemas.WeightHistoryResponse])
def get_weight(limit: int = 30, current_user: models.User = Depends(auth.get_current_user), db: Session = Depends(get_db)):
    return crud.get_weight_history(db, user_id=current_user.id, limit=limit)

# --- FOOD LOGGING ---
@app.post("/logs/", response_model=schemas.FoodLogResponse)
def log_food(food: schemas.FoodLogCreate, current_user: models.User = Depends(auth.get_current_user), db: Session = Depends(get_db)):
    return crud.create_food_log(db, user_id=current_user.id, food=food)

@app.get("/logs/", response_model=List[schemas.FoodLogResponse])
def get_logs(limit: int = 100, date: Optional[str] = None, current_user: models.User = Depends(auth.get_current_user), db: Session = Depends(get_db)):
    return crud.get_food_logs_by_user(db, user_id=current_user.id, limit=limit, date_str=date)

# --- AI INTEGRATION ---
@app.post("/ai/analyze-food")
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
    
    if image:
        image_bytes = await image.read()
        mime_type = image.content_type
        
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
        # safe_name = "".join(c if c.isalnum() or c in ".-_" else "_" for c in current_user.name)
        blob_path = f"food_logs/{current_user.id}/{filename}".replace("-", "_")
        
        headers = {
            "Authorization": f"Bearer {blob_token}",
            "Content-Type": mime_type if mime_type else "image/jpeg",
        }
        
        # Let requests handle the url-encoding securely via `params`
        res = requests.put(
            url = f"https://blob.vercel-storage.com/{blob_path}",
            data=image_bytes, 
            headers=headers
        )

        print(blob_path)
        
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
    
    # Inject image_url so frontend can capture it and send it to POST /logs/
    analysis["image_url"] = image_url
    
    return analysis

@app.get("/ai/reminders")
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

if __name__ == "__main__":
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
