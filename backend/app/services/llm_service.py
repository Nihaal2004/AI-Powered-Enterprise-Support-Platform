import os
import time

from google import genai
from google.genai import errors
from google.genai import types


class LLMService:
    def __init__(self):
        self.client = genai.Client(
            api_key=os.environ["GEMINI_API_KEY"]
        )

        self.model = os.getenv(
            "LLM_MODEL",
            "gemini-3.8-flash",
        )

    def generate_support_reply(
        self,
        conversation: str,
        knowledge_chunks: list[dict],
    ) -> str:

        context = "\n\n".join(
            f"[{index}] {chunk['content']}"
            for index, chunk in enumerate(
                knowledge_chunks,
                start=1,
            )
        )

        prompt = f"""
You are an enterprise customer support assistant.

Generate a draft response for a human support agent.

Rules:
- Use only the supplied knowledge-base context.
- Do not invent facts.
- Address the customer's latest problem directly.
- Be concise and professional.
- Cite supporting knowledge using [1], [2], etc.
- If evidence is insufficient, return exactly:
INSUFFICIENT_EVIDENCE

TICKET CONVERSATION:
{conversation}

KNOWLEDGE BASE:
{context}
"""

        max_attempts = 4

        for attempt in range(1, max_attempts + 1):
            try:
                response = self.client.models.generate_content(
                    model=self.model,
                    contents=prompt,
                    config=types.GenerateContentConfig(
                        temperature=0.2,
                    ),
                )

                return response.text.strip()

            except errors.ServerError:
                if attempt == max_attempts:
                    raise

                delay = 2 ** attempt

                print(
                    f"Gemini temporary failure. "
                    f"Retrying in {delay}s "
                    f"({attempt}/{max_attempts})"
                )

                time.sleep(delay)

            except errors.ClientError as exc:
                status_code = getattr(
                    exc,
                    "status_code",
                    None,
                )

                # Free-tier rate limit can also be temporary.
                if (
                    status_code == 429
                    and attempt < max_attempts
                ):
                    delay = 2 ** attempt
                    time.sleep(delay)
                    continue

                raise

        raise RuntimeError(
            "Gemini generation failed after retries"
        )