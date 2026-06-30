import os
import google.generativeai as genai
import json
import re
import requests
from dotenv import load_dotenv
from fastapi import HTTPException

load_dotenv()

API_KEY = os.getenv("GEMINI_API_KEY")
if API_KEY:
    genai.configure(api_key=API_KEY)

# Use the flash model for multimodal and fast reasoning
AI_MODEL = os.getenv("GEMINI_MODEL")
model = genai.GenerativeModel(AI_MODEL)

USDA_API_KEY = os.getenv("USDA_API_KEY")

from component.common_foods import COMMON_FOODS

def check_local_medical_cautions(food_key: str, medical_profile: dict) -> json.dumps:
    if not medical_profile:
        return None
        
    illnesses = (medical_profile.get("illnesses") or "").lower()
    allergies = (medical_profile.get("allergies") or "").lower()
    
    allergy_list = [a.strip() for a in allergies.split(",") if a.strip()]
    for allergy in allergy_list:
        if allergy in food_key or food_key in allergy:
            return f"Contains {allergy.capitalize()}, caution for allergies."
            
    if "diabetes" in illnesses:
        high_carb_foods = ["banana", "apple", "white rice", "brown rice", "potato", "sweet potato", "oats"]
        if food_key in high_carb_foods:
            return "High carbohydrate/sugar content, caution for Diabetes."
            
    if "lactose intolerance" in illnesses:
        if food_key in ["milk"]:
            return "Contains lactose, caution for Lactose Intolerance."
            
    return None

def find_local_food(query: str, medical_profile: dict = None) -> json.dumps:
    q = query.strip().lower()
    
    weight_match = re.search(r'(\d+(?:\.\d+)?)\s*(?:g|gram|grams|ml)\b', q)
    food_name = q
    weight = None
    count = None
    
    if weight_match:
        weight = float(weight_match.group(1))
        food_name = re.sub(r'(\d+(?:\.\d+)?)\s*(?:g|gram|grams|ml)\b', '', q).strip()
    else:
        count_match = re.match(r'^(\d+(?:\.\d+)?)\s+(.*)', q)
        if count_match:
            count = float(count_match.group(1))
            food_name = count_match.group(2).strip()
        else:
            word_numbers = {"one": 1.0, "two": 2.0, "three": 3.0, "four": 4.0, "five": 5.0}
            words = q.split()
            if words and words[0] in word_numbers:
                count = word_numbers[words[0]]
                food_name = " ".join(words[1:]).strip()

    food_name = re.sub(r'[^a-zA-Z0-9\s]', '', food_name).strip()
    
    matched_key = None
    matched_food = None
    
    for key, food_info in COMMON_FOODS.items():
        if food_name == key or food_name in food_info["synonyms"]:
            matched_key = key
            matched_food = food_info
            break
            
    if not matched_food and food_name.endswith('s'):
        singular = food_name[:-1]
        for key, food_info in COMMON_FOODS.items():
            if singular == key or singular in food_info["synonyms"]:
                matched_key = key
                matched_food = food_info
                break

    if matched_food:
        calculated_weight = 100.0
        if weight is not None:
            calculated_weight = weight
        elif count is not None:
            serving_weight = matched_food.get("serving_weight", 100.0)
            calculated_weight = count * serving_weight
        else:
            if "serving_weight" in matched_food:
                calculated_weight = matched_food["serving_weight"]
                
        scale = calculated_weight / 100.0
        caution = check_local_medical_cautions(matched_key, medical_profile)
        
        return {
            "food_name": f"{matched_food['name']} ({int(calculated_weight)}g)" if weight is not None or count is not None else matched_food['name'],
            "calories": int(round(matched_food["calories"] * scale)),
            "protein_g": round(matched_food["protein_g"] * scale, 1),
            "carbs_g": round(matched_food["carbs_g"] * scale, 1),
            "fat_g": round(matched_food["fat_g"] * scale, 1),
            "vitamin_c_mg": round(matched_food["vitamin_c_mg"] * scale, 2),
            "calcium_mg": round(matched_food["calcium_mg"] * scale, 1),
            "iron_mg": round(matched_food["iron_mg"] * scale, 2),
            "caution_warning": caution
        }
        
    return None

def search_usda_database(query: str, api_key: str, medical_profile: dict = None) -> json.dumps:
    q = query.strip().lower()
    
    weight_match = re.search(r'(\d+(?:\.\d+)?)\s*(?:g|gram|grams|ml)\b', q)
    food_name = q
    weight = None
    count = None
    
    if weight_match:
        weight = float(weight_match.group(1))
        food_name = re.sub(r'(\d+(?:\.\d+)?)\s*(?:g|gram|grams|ml)\b', '', q).strip()
    else:
        count_match = re.match(r'^(\d+(?:\.\d+)?)\s+(.*)', q)
        if count_match:
            count = float(count_match.group(1))
            food_name = count_match.group(2).strip()
        else:
            word_numbers = {"one": 1.0, "two": 2.0, "three": 3.0, "four": 4.0, "five": 5.0}
            words = q.split()
            if words and words[0] in word_numbers:
                count = word_numbers[words[0]]
                food_name = " ".join(words[1:]).strip()
                
    url = "https://api.nal.usda.gov/fdc/v1/foods/search"
    params = {
        "api_key": api_key,
        "query": food_name,
        "pageSize": 1
    }
    
    try:
        res = requests.get(url, params=params, timeout=5)
        if res.status_code != 200:
            print(f"USDA API failed: {res.status_code}")
            return None
            
        data = res.json()
        if not data.get("foods"):
            return None
            
        food = data["foods"][0]
        
        nutrients = {
            "calories": 0.0,
            "protein_g": 0.0,
            "carbs_g": 0.0,
            "fat_g": 0.0,
            "vitamin_c_mg": 0.0,
            "calcium_mg": 0.0,
            "iron_mg": 0.0
        }
        
        for n in food.get("foodNutrients", []):
            nid = n.get("nutrientId")
            val = n.get("value", 0.0)
            if nid == 1008:
                nutrients["calories"] = val
            elif nid == 1003:
                nutrients["protein_g"] = val
            elif nid == 1005:
                nutrients["carbs_g"] = val
            elif nid == 1004:
                nutrients["fat_g"] = val
            elif nid == 1162:
                nutrients["vitamin_c_mg"] = val
            elif nid == 1087:
                nutrients["calcium_mg"] = val
            elif nid == 1089:
                nutrients["iron_mg"] = val
                
        calculated_weight = 100.0
        if weight is not None:
            calculated_weight = weight
        elif count is not None:
            calculated_weight = count * 100.0
            
        scale = calculated_weight / 100.0
        desc_lower = food.get("description", "").lower()
        caution = check_local_medical_cautions(desc_lower, medical_profile)
        
        return {
            "food_name": f"{food.get('description')} ({int(calculated_weight)}g)" if weight is not None or count is not None else food.get('description'),
            "calories": int(round(nutrients["calories"] * scale)),
            "protein_g": round(nutrients["protein_g"] * scale, 1),
            "carbs_g": round(nutrients["carbs_g"] * scale, 1),
            "fat_g": round(nutrients["fat_g"] * scale, 1),
            "vitamin_c_mg": round(nutrients["vitamin_c_mg"] * scale, 2),
            "calcium_mg": round(nutrients["calcium_mg"] * scale, 1),
            "iron_mg": round(nutrients["iron_mg"] * scale, 2),
            "caution_warning": caution
        }
    except Exception as e:
        print(f"USDA Database error: {e}")
        return None

# Initialize lazy-loaded global OCR engine
ocr_engine = None

def compress_image_for_ai(image_bytes: bytes, max_dim: int = 1024, quality: int = 75) -> bytes:
    """
    Compresses image bytes by scaling the image down so its maximum dimension is max_dim (preserving aspect ratio)
    and saving as JPEG at the specified quality level.
    """
    try:
        from PIL import Image
        import io
        
        # Read image
        img = Image.open(io.BytesIO(image_bytes))
        
        # Convert to RGB if needed (since JPEG does not support RGBA alpha channels)
        if img.mode != "RGB":
            img = img.convert("RGB")
            
        width, height = img.size
        # Resize if dimensions exceed max_dim
        if width > max_dim or height > max_dim:
            if width > height:
                new_width = max_dim
                new_height = int(round(height * (max_dim / width)))
            else:
                new_height = max_dim
                new_width = int(round(width * (max_dim / height)))
                
            img = img.resize((new_width, new_height), Image.Resampling.LANCZOS)
            print(f"Resized image from {width}x{height} to {new_width}x{new_height}")
            
        # Compress
        out_buf = io.BytesIO()
        img.save(out_buf, format="JPEG", quality=quality, optimize=True)
        compressed_bytes = out_buf.getvalue()
        
        orig_sz = len(image_bytes)
        comp_sz = len(compressed_bytes)
        reduction = (1 - comp_sz / orig_sz) * 100 if orig_sz > 0 else 0
        print(f"Image compressed: {orig_sz / 1024:.1f} KB -> {comp_sz / 1024:.1f} KB ({reduction:.1f}% reduction)")
        
        return compressed_bytes
    except Exception as e:
        print(f"Error during image preprocessing/compression: {e}")
        # Return original bytes if anything fails
        return image_bytes

def init_ocr_engine():
    """
    Eagerly loads and initializes the local OCR engine.
    """
    global ocr_engine
    if ocr_engine is None:
        try:
            from rapidocr_onnxruntime import RapidOCR
            ocr_engine = RapidOCR()
            print("Successfully initialized RapidOCR engine.")
        except Exception as e:
            try:
                from rapidocr import RapidOCR
                ocr_engine = RapidOCR()
                print("Successfully initialized RapidOCR (fallback package).")
            except Exception as e2:
                print(f"Failed to load RapidOCR: {e} | {e2}")

def extract_text_from_image(image_bytes: bytes) -> str:
    """
    Extracts text from image bytes using a local RapidOCR engine.
    """
    init_ocr_engine()
    if ocr_engine is None:
        return ""

    try:
        from PIL import Image
        import numpy as np
        import io

        image = Image.open(io.BytesIO(image_bytes))
        if image.mode != "RGB":
            image = image.convert("RGB")

        img_array = np.array(image)
        result, _ = ocr_engine(img_array)

        if not result:
            return ""

        # result format: [[box, text, confidence], ...]
        texts = [res[1] for res in result if res and len(res) > 1]
        return "\n".join(texts)
    except Exception as e:
        print(f"Error during local OCR extraction: {e}")
        return ""

def analyze_food_multimodal(food_text: str, image_bytes: bytes, mime_type: str, medical_profile: dict = None):
    """
    Analyzes food input (text and/or image) and returns nutrition data + medical cautions based on the user's profile.
    First tries to resolve queries locally via the Common Foods Database or via the USDA FDC API (if configured).
    If no matches are found, it falls back to Gemini AI parsing.
    """
    # 1. If we have image bytes, we run local OCR to extract text from the image
    ocr_text = ""
    if image_bytes:
        print("Image uploaded. Running local OCR...")
        ocr_text = extract_text_from_image(image_bytes)
        if ocr_text:
            print(f"OCR successfully extracted text:\n{ocr_text}")
        else:
            print("OCR did not find any text in the image.")

    # 2. Formulate target search query text
    # Prefer manual food description text, fallback to OCR text
    search_query = food_text.strip() if food_text else ocr_text.strip()
    
    if search_query:
        # A. Try Local Curated Food Database first
        print(f"Searching local common foods database for: '{search_query}'")
        local_result = find_local_food(search_query, medical_profile)
        if local_result:
            print(f"Local Database HIT: Found '{local_result['food_name']}'")
            return local_result
            
        # B. Try USDA FoodData Central API next if API key is configured
        if USDA_API_KEY and USDA_API_KEY != "your_usda_api_key_here":
            print(f"Searching USDA database for: '{search_query}'")
            usda_result = search_usda_database(search_query, USDA_API_KEY, medical_profile)
            if usda_result:
                print(f"USDA Database HIT: Found '{usda_result['food_name']}'")
                return usda_result

    # C. Fallback to Gemini AI if not resolved by databases
    print("Database search missed or unavailable. Falling back to Gemini AI...")
    
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

    combined_input = ""
    if food_text:
        combined_input += f"User Text Description: {food_text}\n"
    if ocr_text:
        combined_input += f"Extracted Text from Image (via Local OCR):\n{ocr_text}\n"

    if not combined_input:
        combined_input = "No description or OCR text provided. Analyze default food."

    prompt = f"""
    You are an expert nutritionist AI.
    The user wants to log food based on a text description, text extracted from a photo, or by analyzing the uploaded photo visually.
    
    Food Input Data:
    {combined_input}
    
    User Medical Profile Context:
    Illnesses: {medical_profile.get('illnesses') if medical_profile else 'None'}
    Allergies: {medical_profile.get('allergies') if medical_profile else 'None'}
    
    Task:
    1. Identify the food. If an image is provided, identify it visually from the image. If text description/OCR text is provided, use that to guide identification.
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

    contents = [prompt]
    if image_bytes and not ocr_text:
        compressed_bytes = compress_image_for_ai(image_bytes)
        contents.append({
            "mime_type": "image/jpeg",
            "data": compressed_bytes
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