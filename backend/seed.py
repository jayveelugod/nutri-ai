import datetime
from sqlalchemy.orm import Session
from database import SessionLocal, engine
import models
import crud

def seed_db():
    print("Creating tables if they don't exist...")
    models.Base.metadata.create_all(bind=engine)
    
    db: Session = SessionLocal()
    
    try:
        print("Checking for existing test user...")
        # Check if user already exists
        test_user = crud.get_user_by_email(db, email="test@student.edu")
        
        if not test_user:
            print("Creating test user...")
            hashed_pw = crud.get_password_hash("password123")
            test_user = models.User(
                email="test@student.edu",
                name="Test Student",
                hashed_password=hashed_pw
            )
            db.add(test_user)
            db.commit()
            db.refresh(test_user)
        else:
            print("Test user already exists. Using existing user.")

        print("Checking for existing medical profile...")
        test_profile = crud.get_medical_profile(db, user_id=test_user.id)
        if not test_profile:
            print("Creating medical profile...")
            # Create a profile to test the medical caution system
            bmi = crud.calculate_bmi(weight_kg=75, height_cm=175)
            daily_cals = crud.calculate_daily_calories(weight_kg=75, height_cm=175, target_weight_kg=70)
            
            test_profile = models.MedicalProfile(
                user_id=test_user.id,
                height_cm=175.0,
                weight_kg=75.0,
                target_weight_kg=70.0, # Target weight loss
                bmi=bmi,
                daily_calorie_goal=daily_cals,
                illnesses="Diabetes", # To trigger caution on high sugar/carbs
                allergies="Peanuts, Shellfish" # To trigger allergy warnings
            )
            db.add(test_profile)
            db.commit()
        else:
            print("Medical profile already exists.")

        print("Checking existing food logs...")
        logs = crud.get_food_logs_by_user(db, user_id=test_user.id)
        if not logs:
            print("Creating dummy food logs for behavioral learning..." )
            
            now = datetime.datetime.utcnow() + datetime.timedelta(hours=8)
            
            # Yesterday's meals
            log1 = models.FoodLog(
                user_id=test_user.id,
                meal_type="Breakfast",
                food_name="Oatmeal with berries",
                calories=300,
                protein_g=10.0,
                carbs_g=55.0,
                fat_g=5.0,
                logged_at=now - datetime.timedelta(days=1, hours=4) # Assume now is midday, so morning yesterday
            )
            log2 = models.FoodLog(
                user_id=test_user.id,
                meal_type="Lunch",
                food_name="Grilled Chicken Salad",
                calories=450,
                protein_g=40.0,
                carbs_g=15.0,
                fat_g=20.0,
                logged_at=now - datetime.timedelta(days=1) # Midday yesterday
            )
            
            # Today's breakfast
            log3 = models.FoodLog(
                user_id=test_user.id,
                meal_type="Breakfast",
                food_name="Avocado Toast",
                calories=350,
                protein_g=8.0,
                carbs_g=30.0,
                fat_g=22.0,
                logged_at=now - datetime.timedelta(hours=4) # Morning today
            )
            
            db.add_all([log1, log2, log3])
            db.commit()
            print("Food logs created successfully.")
        else:
            print(f"Found {len(logs)} existing food logs. Skipping creation.")
            
        print("Database seeded successfully! You can now test the API with user_id=1.")
        
    except Exception as e:
        print(f"An error occurred during seeding: {e}")
        db.rollback()
    finally:
        db.close()

if __name__ == "__main__":
    seed_db()
