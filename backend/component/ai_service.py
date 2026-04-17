import os
import google.generativeai as genai
import json
from dotenv import load_dotenv

load_dotenv()

API_KEY = os.getenv("GEMINI_API_KEY")
if API_KEY:
    genai.configure(api_key=API_KEY)

# Use the flash model for multimodal and fast reasoning
AI_MODEL = os.getenv("GEMINI_MODEL")
model = genai.GenerativeModel(AI_MODEL)

# for m in genai.list_models():
#     print(m.name, m.supported_generation_methods)

def analyze_food_multimodal(food_text: str, image_bytes: bytes, mime_type: str, medical_profile: dict = None):
    """
    Analyzes food input (text and/or image) and returns nutrition data + medical cautions based on the user's profile.
    """
    if not API_KEY or API_KEY == "your_gemini_api_key_here":
        # Mock response if no API key is set for local testing without key
        return {
            "food_name": food_text or "Detected Food",
            "calories": 350,
            "protein_g": 20,
            "carbs_g": 30,
            "fat_g": 15,
            "vitamin_c_mg": 10.5,
            "calcium_mg": 120.0,
            "iron_mg": 2.5,
            "caution_warning": "Mock warning: Please ensure this fits your diet." if medical_profile else None
        }

    contents = []
    
    prompt = f"""
    You are an expert nutritionist AI.
    The user wants to log food. 
    User Description: {food_text if food_text else 'Analyze the provided image'}
    
    User Medical Profile Context:
    Illnesses: {medical_profile.get('illnesses') if medical_profile else 'None'}
    Allergies: {medical_profile.get('allergies') if medical_profile else 'None'}
    
    Task:
    1. Identify the food.
    2. Estimate the calories, protein, carbs, and fat per serving.
    3. Estimate key micronutrients: Vitamin C (mg), Calcium (mg), and Iron (mg).
    4. MEDICAL CAUTION SYSTEM: Based on the user's illnesses and allergies, determine if this food is safe. If not, provide a succinct warning (e.g., 'High sugar content, caution for Diabetes'). If safe, return null.
    
    Return ONLY a valid JSON object matching this schema exactly:
    {{
        "food_name": "String",
        "calories": integer,
        "protein_g": float,
        "carbs_g": float,
        "fat_g": float,
        "vitamin_c_mg": float,
        "calcium_mg": float,
        "iron_mg": float,
        "caution_warning": "String or null"
    }}
    Ensure no markdown wrapping like ```json
    """
    
    contents.append(prompt)
    
    if image_bytes:
        contents.append({
            "mime_type": mime_type,
            "data": image_bytes
        })
        
    try:
        response = model.generate_content(contents)
        result_text = response.text.strip()
        # Clean up if the model wrapped it in markdown
        if result_text.startswith("```json"):
            result_text = result_text[7:-3].strip()
        elif result_text.startswith("```"):
            result_text = result_text[3:-3].strip()
            
        parsed_data = json.loads(result_text)
        return parsed_data
    except Exception as e:
        print(f"Gemini API Error: {e}")
        # Fallback to prevent crash
        return {
            "food_name": "Error Processing",
            "calories": 0,
            "protein_g": 0.0,
            "carbs_g": 0.0,
            "fat_g": 0.0,
            "vitamin_c_mg": 0.0,
            "calcium_mg": 0.0,
            "iron_mg": 0.0,
            "caution_warning": "Failed to analyze food."
        }
