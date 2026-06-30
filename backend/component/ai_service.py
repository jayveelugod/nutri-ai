import os
import google.generativeai as genai
import json
from dotenv import load_dotenv
from fastapi import HTTPException

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
        
        # Check if the response was blocked by safety filters
        if not response.parts:
            block_reason = "Unknown"
            if response.prompt_feedback and response.prompt_feedback.block_reason:
                block_reason = str(response.prompt_feedback.block_reason)
            print(f"Gemini API: Response blocked. Reason: {block_reason}")
            raise HTTPException(
                status_code=400,
                detail=f"The image or text was blocked by content safety filters (reason: {block_reason}). Please try a different input."
            )
        
        result_text = response.text.strip()
        # Clean up if the model wrapped it in markdown
        if result_text.startswith("```json"):
            result_text = result_text[7:-3].strip()
        elif result_text.startswith("```"):
            result_text = result_text[3:-3].strip()
            
        parsed_data = json.loads(result_text)
        return parsed_data
    except HTTPException:
        raise  # Re-raise our own HTTPExceptions as-is
    except json.JSONDecodeError as e:
        print(f"Gemini API: Failed to parse AI response as JSON: {e}")
        raise HTTPException(
            status_code=502,
            detail="The AI returned an invalid response. Please try again."
        )
    except Exception as e:
        error_type = type(e).__name__
        error_msg = str(e)
        print(f"Gemini API Error [{error_type}]: {error_msg}")
        
        # Map common google-api-core / generativeai errors to proper status codes
        status_code = 500
        detail = "An unexpected error occurred while analyzing the food. Please try again later."
        
        error_lower = error_msg.lower()
        
        if "429" in error_msg or "resource_exhausted" in error_lower or "rate limit" in error_lower or "quota" in error_lower:
            status_code = 429
            detail = "AI service rate limit reached."
        elif "401" in error_msg or "unauthenticated" in error_lower or "invalid api key" in error_lower:
            status_code = 401
            detail = "AI service authentication failed. The API key may be invalid or expired."
        elif "403" in error_msg or "permission_denied" in error_lower or "forbidden" in error_lower:
            status_code = 403
            detail = "AI service access denied. The API key does not have permission for this model or the API key was reported as leaked. Please use another API key."
        elif "404" in error_msg or "not_found" in error_lower or "model" in error_lower and "not found" in error_lower:
            status_code = 404
            detail = "The configured AI model was not found. Please check the GEMINI_MODEL setting."
        elif "400" in error_msg or "invalid_argument" in error_lower or "invalid" in error_lower:
            status_code = 400
            detail = f"Invalid request to AI service: {error_msg}"
        elif "503" in error_msg or "unavailable" in error_lower:
            status_code = 503
            detail = "The AI service is temporarily unavailable. Please try again later."
        elif "deadline" in error_lower or "timeout" in error_lower:
            status_code = 504
            detail = "The AI service took too long to respond. Please try again."
        
        raise HTTPException(status_code=status_code, detail=detail)