import os
import threading
import queue
import logging
from typing import List, Dict, Union
from io import BytesIO

from dotenv import load_dotenv
from PIL import Image
from google import genai
from google.genai import types

logger = logging.getLogger(__name__)

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
                # Check if ImageConfig exists in types
                has_image_config = hasattr(types, 'ImageConfig')
                
                if has_image_config:
                    # Use ImageConfig if available (newer API)
                    config = types.GenerateContentConfig(
                        response_modalities=["IMAGE"],
                        image_config=types.ImageConfig(aspect_ratio=self.aspect_ratio),
                    )
                else:
                    # Fallback: Create config without ImageConfig (older API or different structure)
                    config = types.GenerateContentConfig(
                        response_modalities=["IMAGE"],
                    )
                    # Try to set aspect ratio if the config supports it
                    try:
                        if hasattr(config, 'image_config'):
                            # If image_config attribute exists, try to set it
                            config.image_config = {"aspect_ratio": self.aspect_ratio}
                    except (AttributeError, TypeError):
                        # If setting fails, continue without aspect ratio
                        pass

                response = genai_client.models.generate_content(
                    model=IMAGE_GENERATION_MODEL,
                    contents=contents,
                    config=config,
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
                raise error
            else:
                raise error_data

        response = result_q.get()

        pil_image = None

        # Check if response has parts and it's not None
        if response.parts is None:
            # Log response details for debugging
            finish_reason = getattr(response, 'finish_reason', None)
            candidates = getattr(response, 'candidates', None)
            logger.error(f"API response has no parts. finish_reason={finish_reason}, candidates={candidates}")
            raise RuntimeError(f"API response has no parts (finish_reason: {finish_reason})")
        
        # Check if parts is iterable and not empty
        if not response.parts:
            finish_reason = getattr(response, 'finish_reason', None)
            logger.warning(f"API response returned empty parts list (finish_reason: {finish_reason})")
            raise RuntimeError(f"API response returned empty parts list (finish_reason: {finish_reason})")

        # Iterate through parts to find image data
        parts_checked = 0
        for part in response.parts:
            parts_checked += 1
            if part and hasattr(part, 'inline_data') and part.inline_data:
                img_bytes = part.inline_data.data
                if img_bytes:
                    pil_image = Image.open(BytesIO(img_bytes)).convert("RGB")
                    logger.debug(f"Successfully extracted image from part {parts_checked}")
                    break

        if pil_image is None:
            # Log more details about the response for debugging
            finish_reason = getattr(response, 'finish_reason', None)
            candidates = getattr(response, 'candidates', None)
            parts_count = len(response.parts) if response.parts else 0
            logger.error(
                f"No image found in response. "
                f"parts_count={parts_count}, "
                f"finish_reason={finish_reason}, "
                f"candidates={candidates}"
            )
            error_msg = f"No image returned from API (checked {parts_count} parts, finish_reason: {finish_reason})"
            raise RuntimeError(error_msg)

        pil_image.save(file_path)
        self.previous_image = pil_image

        print(f"Saved {file_path} ({os.path.getsize(file_path)} bytes)")
        return file_path