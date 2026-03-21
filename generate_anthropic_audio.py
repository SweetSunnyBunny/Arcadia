"""
Generate Anthropic Article Audio
================================

Fetches text from an Anthropic article URL, generates Kokoro TTS audio,
and saves it as an MP3 in audio/anthropic/.

Usage:
    python generate_anthropic_audio.py <url> [--slug <slug>] [--voice <identity>]

Examples:
    python generate_anthropic_audio.py https://www.anthropic.com/research/claudes-constitution
    python generate_anthropic_audio.py https://www.anthropic.com/research/core-views-on-ai-safety --slug core-views
    python generate_anthropic_audio.py https://www.anthropic.com/research/claude-character --voice Claude

The script will:
1. Fetch the page HTML
2. Extract article text (stripping nav, footer, scripts, etc.)
3. Generate Kokoro TTS audio using the specified voice
4. Save as MP3 in audio/anthropic/<slug>.mp3
"""

import argparse
import io
import re
import sys
from pathlib import Path
from urllib.parse import urlparse

import numpy as np
import requests
import soundfile as sf
from bs4 import BeautifulSoup

AUDIO_DIR = Path(__file__).parent / "audio" / "anthropic"
AUDIO_DIR.mkdir(parents=True, exist_ok=True)

# Voice mappings (same as arcadia_pages_server.py)
IDENTITY_VOICES = {
    "Caelan": "am_onyx",
    "Charlie": "am_puck",
    "Booker": "bm_daniel",
    "Sebastian": "am_liam",
    "Claude": "am_echo",
    "Suki": "bm_fable",
}
DEFAULT_VOICE = "am_echo"  # Claude's voice for Anthropic articles


def slug_from_url(url):
    """Extract a slug from an Anthropic URL."""
    path = urlparse(url).path.rstrip("/")
    return path.split("/")[-1] or "article"


def fetch_article_text(url):
    """Fetch and extract article text from an Anthropic URL."""
    print(f"Fetching: {url}")
    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
    }
    resp = requests.get(url, headers=headers, timeout=30)
    resp.raise_for_status()

    soup = BeautifulSoup(resp.text, "html.parser")

    # Remove non-content elements
    for tag in soup.find_all(["nav", "footer", "script", "style", "noscript", "header"]):
        tag.decompose()

    # Try to find article content - Anthropic uses various containers
    content = None
    for selector in ["article", "[role='main']", "main", ".post-content", ".article-content", ".prose"]:
        content = soup.select_one(selector)
        if content:
            break

    if not content:
        # Fall back to body
        content = soup.find("body")

    if not content:
        raise ValueError("Could not extract article content")

    # Extract text, preserving paragraph breaks
    paragraphs = []
    for element in content.find_all(["p", "h1", "h2", "h3", "h4", "li", "blockquote"]):
        text = element.get_text(strip=True)
        if text and len(text) > 5:  # Skip tiny fragments
            paragraphs.append(text)

    full_text = "\n\n".join(paragraphs)

    # Clean up
    full_text = re.sub(r"\s+", " ", full_text)  # Collapse whitespace within lines
    full_text = re.sub(r"\n{3,}", "\n\n", full_text)  # Max 2 newlines

    print(f"Extracted {len(full_text)} characters ({len(paragraphs)} paragraphs)")
    return full_text


def generate_audio(text, voice_id):
    """Generate Kokoro TTS audio from text. Returns WAV bytes."""
    from kokoro import KPipeline

    prefix = voice_id[:2] if len(voice_id) >= 2 else "am"
    lang_map = {"af": "a", "am": "a", "bf": "b", "bm": "b"}
    lang = lang_map.get(prefix, "a")

    print(f"Creating Kokoro pipeline (lang={lang}, voice={voice_id})")
    pipeline = KPipeline(lang_code=lang)

    # Process in chunks for long text — Kokoro handles this internally
    # but we want progress feedback
    chunks = []
    char_count = 0
    total = len(text)

    for i, (_, _, audio) in enumerate(pipeline(text, voice=voice_id, speed=1.0)):
        chunks.append(audio)
        char_count = min(char_count + 500, total)  # Approximate progress
        pct = min(99, int(char_count / total * 100))
        print(f"\r  Generating audio... {pct}%", end="", flush=True)

    print(f"\r  Generating audio... 100%")

    if not chunks:
        raise ValueError("Kokoro produced no audio output")

    full_audio = np.concatenate(chunks)
    print(f"  Generated {len(full_audio) / 24000:.1f}s of audio")
    return full_audio


def save_as_mp3(audio_data, output_path):
    """Save audio as MP3 via WAV intermediate."""
    # First save as WAV
    wav_buf = io.BytesIO()
    sf.write(wav_buf, audio_data, 24000, format="WAV")
    wav_buf.seek(0)

    # Convert to MP3 using pydub if available, otherwise save as WAV
    try:
        from pydub import AudioSegment
        segment = AudioSegment.from_wav(wav_buf)
        segment.export(str(output_path), format="mp3", bitrate="128k")
        print(f"  Saved MP3: {output_path}")
    except ImportError:
        # Fall back to WAV
        wav_path = output_path.with_suffix(".wav")
        sf.write(str(wav_path), audio_data, 24000, format="WAV")
        print(f"  Saved WAV (install pydub for MP3): {wav_path}")
        print("  pip install pydub  (also needs ffmpeg)")


def main():
    parser = argparse.ArgumentParser(description="Generate audio from Anthropic articles")
    parser.add_argument("url", help="Anthropic article URL")
    parser.add_argument("--slug", help="Output filename slug (default: from URL)")
    parser.add_argument("--voice", default="Claude", help="Voice identity (default: Claude)")
    parser.add_argument("--text-only", action="store_true", help="Just extract text, don't generate audio")
    args = parser.parse_args()

    slug = args.slug or slug_from_url(args.url)
    voice_id = IDENTITY_VOICES.get(args.voice, DEFAULT_VOICE)

    # Fetch article
    text = fetch_article_text(args.url)

    if args.text_only:
        print("\n--- Extracted Text ---")
        print(text)
        return

    # Generate audio
    audio_data = generate_audio(text, voice_id)

    # Save
    output_path = AUDIO_DIR / f"{slug}.mp3"
    save_as_mp3(audio_data, output_path)

    print(f"\nDone! Audio saved to: {output_path}")
    print(f"  Article: {args.url}")
    print(f"  Voice: {args.voice} ({voice_id})")
    print(f"  Duration: ~{len(audio_data) / 24000:.0f}s")


if __name__ == "__main__":
    main()
