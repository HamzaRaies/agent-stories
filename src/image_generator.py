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
            # Combine text parts into a single prompt
            prompt_parts = []
            reference_images = []

            for item in contents:
                if isinstance(item, str):
                    prompt_parts.append(item)
                elif isinstance(item, types.Part) and item.inline_data:
                    reference_images.append(item.inline_data.data)

            prompt_text = "\n".join(prompt_parts)

            response = genai_client.images.generate(
                model=IMAGE_GENERATION_MODEL,
                prompt=prompt_text,
                reference_images=reference_images if reference_images else None,
                generation_config={
                    "aspect_ratio": self.aspect_ratio,  # "3:4"
                },
            )

            result_q.put(response)

        except Exception as e:
            import traceback
            error_q.put({
                "error": str(e),
                "error_type": type(e).__name__,
                "traceback": traceback.format_exc()
            })

    t = threading.Thread(target=worker, daemon=True)
    t.start()
    t.join(timeout=120)

    if t.is_alive():
        raise TimeoutError("Image generation timeout")

    if not error_q.empty():
        err = error_q.get()
        print("Image generation error:", err["error"])
        print("Type:", err["error_type"])
        print("Traceback:", err["traceback"])
        raise RuntimeError(err["error"])

    response = result_q.get()

    if not response.images:
        raise RuntimeError("No image returned from model")

    img_bytes = response.images[0].image_bytes
    pil_image = Image.open(BytesIO(img_bytes)).convert("RGB")

    pil_image.save(file_path)
    self.previous_image = pil_image

    print(f"Saved {file_path} ({os.path.getsize(file_path)} bytes)")
    return file_path
