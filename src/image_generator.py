import os
import threading
import queue
from typing import List, Dict, Union
from io import BytesIO

from dotenv import load_dotenv
from PIL import Image
from google import genai
from google.genai import types

load_dotenv()

google_api_key = os.getenv("GOOGLE_API_KEY")

genai_client = genai.Client(api_key=google_api_key)

OUTPUT_DIR = "scene_images"
IMAGE_EXT = "png"
IMAGE_GENERATION_MODEL = "gemini-2.5-flash-image"

os.makedirs(OUTPUT_DIR, exist_ok=True)

class ImageGenerator:
    def __init__(
        self,
        output_dir: str = OUTPUT_DIR,
        story_id: int | None = None,
        style: str = "Cinematic",
    ):
        self.output_dir = output_dir
        self.story_id = story_id
        self.style = style
        self.aspect_ratio = "3:4"

        # ALWAYS real Pillow image
        self.previous_image: Image.Image | None = None

    def _get_style_prompt(self) -> str:
        styles = {
            "cinematic": "Cinematic film photography, dramatic lighting, professional cinematography.",
            "anime": "Anime art style, vibrant colors, Japanese animation aesthetic.",
            "watercolor": "Watercolor painting, soft brush strokes.",
            "noir": "Film noir, high contrast black and white, dramatic shadows.",
            "cyberpunk": "Cyberpunk aesthetic, neon lights, futuristic city.",
        }
        return f"Style: {styles.get(self.style.lower(), self.style)}"

    def generate_image_for_scene(self, scene: Dict) -> str:
        prompt = scene.get("cinematic_prompt") or scene.get("scene_text", "")
        if not prompt.strip():
            raise ValueError("Empty scene prompt")

        contents: List[Union[str, types.Part]] = []

        if self.previous_image:
            buffer = BytesIO()
            self.previous_image.save(buffer, format="JPEG")
            buffer.seek(0)

            contents.append(
                types.Part.from_bytes(
                    data=buffer.read(),
                    mime_type="image/jpeg",
                )
            )

            contents.append(
                "Maintain strict visual continuity with the provided image. "
                "Characters, faces, clothing, lighting, and environment must remain consistent."
            )

        contents.append(f"{self._get_style_prompt()}\n{prompt}")

        scene_number = scene.get("scene_number", 1)
        filename = (
            f"scene_{self.story_id}_{scene_number:02d}.{IMAGE_EXT}"
            if self.story_id
            else f"scene_{scene_number:02d}.{IMAGE_EXT}"
        )
        file_path = os.path.join(self.output_dir, filename)

        return self._generate_image(contents, file_path)

    def _generate_image(self, contents, file_path) -> str:
        result_q = queue.Queue()
        error_q = queue.Queue()

        def worker():
            try:
                # Add aspect ratio to prompt since ImageConfig is not available
                aspect_prompt = f"Create this image with {self.aspect_ratio} aspect ratio. "
                
                # Modify contents to include aspect ratio
                modified_contents = contents.copy()
                if modified_contents and isinstance(modified_contents[-1], str):
                    # Add aspect ratio to the last prompt string
                    modified_contents[-1] = aspect_prompt + modified_contents[-1]
                else:
                    # Insert aspect ratio as first element if no string found
                    modified_contents.insert(0, aspect_prompt)
                
                # Try with GenerateContentConfig (ImageConfig removed in newer API)
                try:
                    config = types.GenerateContentConfig(
                        response_modalities=["IMAGE"],
                    )
                    response = genai_client.models.generate_content(
                        model=IMAGE_GENERATION_MODEL,
                        contents=modified_contents,
                        config=config,
                    )
                except (AttributeError, TypeError) as config_error:
                    # Fallback: try without config if GenerateContentConfig fails
                    print(f"Warning: GenerateContentConfig failed, trying without config: {config_error}")
                    response = genai_client.models.generate_content(
                        model=IMAGE_GENERATION_MODEL,
                        contents=modified_contents,
                    )
                
                result_q.put(response)
            except Exception as e:
                import traceback
                error_details = {
                    "error": str(e),
                    "error_type": type(e).__name__,
                    "traceback": traceback.format_exc()
                }
                error_q.put((e, error_details))

        t = threading.Thread(target=worker, daemon=True)
        t.start()
        t.join(timeout=120)

        if t.is_alive():
            raise TimeoutError("Image generation timeout")

        if not error_q.empty():
            error_data = error_q.get()
            if isinstance(error_data, tuple):
                error, error_details = error_data
                print(f"Image generation error: {error_details['error']}")
                print(f"Error type: {error_details['error_type']}")
                print(f"Traceback: {error_details['traceback']}")
                raise error
            else:
                raise error_data

        response = result_q.get()

        pil_image = None
        img_bytes = None

        # Try different response structures based on API version
        # The API structure changed - response might have candidates[0].content.parts
        try:
            # Method 1: New API structure with candidates
            if hasattr(response, 'candidates') and response.candidates:
                candidate = response.candidates[0]  # Get first candidate
                if hasattr(candidate, 'content'):
                    content = candidate.content
                    if hasattr(content, 'parts'):
                        for part in content.parts:
                            if hasattr(part, 'inline_data') and part.inline_data:
                                img_bytes = part.inline_data.data
                                break
            # Method 2: Direct parts access (old API)
            elif hasattr(response, 'parts'):
                for part in response.parts:
                    if hasattr(part, 'inline_data') and part.inline_data:
                        img_bytes = part.inline_data.data
                        break
        except (AttributeError, IndexError, KeyError) as e:
            # Debug: print response structure for troubleshooting
            print(f"DEBUG: Response type: {type(response)}")
            print(f"DEBUG: Response dir: {[attr for attr in dir(response) if not attr.startswith('_')]}")
            if hasattr(response, 'candidates'):
                print(f"DEBUG: Candidates: {response.candidates}")
                if response.candidates:
                    print(f"DEBUG: First candidate dir: {[attr for attr in dir(response.candidates[0]) if not attr.startswith('_')]}")
            raise RuntimeError(f"Could not extract image from response structure: {e}. Response type: {type(response)}")

        if img_bytes is None:
            raise RuntimeError("No image returned - could not find image data in response")
        
        # Convert image bytes to PIL Image
        # The data might be base64-encoded (common in API responses)
        try:
            import base64
            
            # Check if data is base64-encoded by looking at first bytes
            # PNG magic bytes: \x89PNG\r\n\x1a\n
            # Base64 of PNG magic: iVBORw0KGgo
            raw_bytes = None
            
            if isinstance(img_bytes, bytes):
                # Check if it's base64-encoded bytes (starts with b'iVBORw0KGgo' or similar)
                if img_bytes.startswith(b'iVBORw0KGgo') or img_bytes.startswith(b'/9j/') or img_bytes.startswith(b'R0lGOD'):
                    # It's base64-encoded, decode it
                    try:
                        raw_bytes = base64.b64decode(img_bytes)
                    except Exception:
                        # Maybe it's already raw bytes, try direct
                        raw_bytes = img_bytes
                else:
                    # Try to decode as base64 first (API often returns base64)
                    try:
                        decoded = base64.b64decode(img_bytes)
                        # Check if decoded data looks like an image (PNG, JPEG, etc.)
                        if decoded.startswith(b'\x89PNG') or decoded.startswith(b'\xff\xd8') or decoded.startswith(b'GIF'):
                            raw_bytes = decoded
                        else:
                            # Not base64, use original
                            raw_bytes = img_bytes
                    except Exception:
                        # Not base64, use as-is
                        raw_bytes = img_bytes
            elif isinstance(img_bytes, str):
                # String - definitely base64
                raw_bytes = base64.b64decode(img_bytes)
            elif hasattr(img_bytes, 'read'):
                # BytesIO object
                img_bytes.seek(0)
                data = img_bytes.read()
                img_bytes.seek(0)
                # Check if it's base64
                if isinstance(data, bytes) and (data.startswith(b'iVBORw0KGgo') or data.startswith(b'/9j/')):
                    raw_bytes = base64.b64decode(data)
                else:
                    raw_bytes = data
            else:
                raw_bytes = bytes(img_bytes)
            
            # Create buffer from raw bytes
            buffer = BytesIO(raw_bytes)
            buffer.seek(0)
            
            # Open image from buffer
            pil_image = Image.open(buffer).convert("RGB")
            buffer.close()
        except Exception as e:
            print(f"DEBUG: Image data type: {type(img_bytes)}")
            print(f"DEBUG: Image data length: {len(img_bytes) if hasattr(img_bytes, '__len__') else 'N/A'}")
            if isinstance(img_bytes, bytes):
                print(f"DEBUG: First 100 bytes: {img_bytes[:100]}")
                # Try to decode as base64 and show first bytes
                try:
                    import base64
                    decoded = base64.b64decode(img_bytes)
                    print(f"DEBUG: After base64 decode, first 20 bytes: {decoded[:20]}")
                    print(f"DEBUG: Decoded looks like PNG: {decoded.startswith(b'\\x89PNG')}")
                except:
                    pass
            raise RuntimeError(f"Could not open image from data: {e}")

        pil_image.save(file_path)
        self.previous_image = pil_image

        print(f"Saved {file_path} ({os.path.getsize(file_path)} bytes)")
        return file_path