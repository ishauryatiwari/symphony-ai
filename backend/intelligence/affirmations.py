"""Predefined affirmation bank — the graceful fallback when Ollama is offline.

Two sentences each. Warm, non-judgmental, never medical.
"""

from __future__ import annotations

from typing import Dict, List

FALLBACK_AFFIRMATIONS: Dict[str, List[str]] = {
    "calm": [
        "Take a slow breath and give yourself a moment before reacting. "
        "You do not have to solve everything at once.",
        "You are here in this moment, and you can take it one breath at a time. "
        "Let your shoulders relax and allow yourself a little space.",
        "Let your shoulders drop and your breathing slow. "
        "Calm is not something you chase — it is something you allow.",
        "Feel the weight of the moment soften with each exhale. "
        "You are safe to move at your own pace right now.",
    ],
    "happy": [
        "This moment does not define your whole story. "
        "Give yourself permission to move forward one small step at a time.",
        "A little lightness is allowed, even on heavy days. "
        "Let this small spark remind you that brighter moments are real.",
        "You have carried a lot, and you are still here. "
        "Let hope lean in close — it has not given up on you.",
    ],
    "energy": [
        "Hold onto this positive energy and let it carry you forward. "
        "You have the opportunity to make this moment meaningful.",
        "Your energy is a current — point it at one thing you care about. "
        "Small momentum becomes big motion.",
        "This is a good moment to take one brave step. "
        "The rhythm you feel right now is yours to keep.",
    ],
}

_cursor: Dict[str, int] = {"calm": 0, "happy": 0, "energy": 0}


def get_fallback(state: str) -> str:
    """Round-robin pick so consecutive affirmations vary."""
    bank = FALLBACK_AFFIRMATIONS.get(state, FALLBACK_AFFIRMATIONS["calm"])
    text = bank[_cursor.get(state, 0) % len(bank)]
    _cursor[state] = _cursor.get(state, 0) + 1
    return text
