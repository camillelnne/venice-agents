"""
Constants for Venice agents application.
Contains Venice landmarks, bounds, and role-based destinations.
"""
from typing import Dict, List

# Venice coordinate bounds for validation
VENICE_BOUNDS = {
    "min_lat": 45.406,
    "max_lat": 45.472,
    "min_lng": 12.285,
    "max_lng": 12.395
}

# Venice landmarks with coordinates
VENICE_LANDMARKS = {
    "RIALTO_MARKET": {"lat": 45.4380, "lng": 12.3358, "name": "Rialto Market"},
    "RIALTO_BRIDGE": {"lat": 45.4380, "lng": 12.3358, "name": "Rialto Bridge"},
    "ST_MARKS_SQUARE": {"lat": 45.4342, "lng": 12.3388, "name": "St. Mark's Square"},
    "DOGES_PALACE": {"lat": 45.4332, "lng": 12.3403, "name": "Doge's Palace"},
    "SANTA_LUCIA": {"lat": 45.4418, "lng": 12.3215, "name": "Santa Lucia"},
    "SANTA_MARIA_SALUTE": {"lat": 45.4306, "lng": 12.3373, "name": "Santa Maria della Salute"},
    "CA_DORO": {"lat": 45.4406, "lng": 12.3322, "name": "Ca' d'Oro"},
}

# Role-based destinations
ROLE_DESTINATIONS: Dict[str, List[dict]] = {
    "merchant": [
        VENICE_LANDMARKS["RIALTO_MARKET"],
        VENICE_LANDMARKS["ST_MARKS_SQUARE"],
        VENICE_LANDMARKS["DOGES_PALACE"],
        VENICE_LANDMARKS["SANTA_MARIA_SALUTE"],
        VENICE_LANDMARKS["CA_DORO"]
    ],
    "gondolier": [
        VENICE_LANDMARKS["SANTA_LUCIA"],
        VENICE_LANDMARKS["SANTA_MARIA_SALUTE"],
        VENICE_LANDMARKS["RIALTO_BRIDGE"],
        VENICE_LANDMARKS["ST_MARKS_SQUARE"]
    ],
    "noble": [
        VENICE_LANDMARKS["DOGES_PALACE"],
        VENICE_LANDMARKS["ST_MARKS_SQUARE"],
        VENICE_LANDMARKS["CA_DORO"],
        VENICE_LANDMARKS["SANTA_MARIA_SALUTE"]
    ],
    "artisan": [
        VENICE_LANDMARKS["RIALTO_MARKET"],
        VENICE_LANDMARKS["ST_MARKS_SQUARE"]
    ],
    "servant": [
        VENICE_LANDMARKS["RIALTO_MARKET"],
        VENICE_LANDMARKS["ST_MARKS_SQUARE"]
    ]
}

# Activity descriptions for destinations
ACTIVITY_MAP = {
    "Rialto Market": "heading to work at the market",
    "Rialto Bridge": "conducting business at Rialto",
    "St. Mark's Square": "visiting San Marco",
    "Doge's Palace": "attending to business at the palace",
    "Santa Lucia": "near the waterfront",
    "Santa Maria della Salute": "visiting the basilica",
    "Ca' d'Oro": "in the Cannaregio district"
}

# Default agent ID
DEFAULT_AGENT_ID = "marco"
