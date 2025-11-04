"""
Validation utilities for Venice agents application.
"""
from constants import VENICE_BOUNDS


def validate_venice_coordinates(lat: float, lng: float) -> bool:
    """
    Validate that coordinates are within Venice bounds.
    
    Args:
        lat: Latitude coordinate
        lng: Longitude coordinate
    
    Returns:
        True if coordinates are within Venice bounds, False otherwise
    """
    return (
        VENICE_BOUNDS["min_lat"] <= lat <= VENICE_BOUNDS["max_lat"] and
        VENICE_BOUNDS["min_lng"] <= lng <= VENICE_BOUNDS["max_lng"]
    )


def validate_time_format(time_str: str) -> bool:
    """
    Validate time string format (HH:MM).
    
    Args:
        time_str: Time string to validate
    
    Returns:
        True if format is valid, False otherwise
    """
    try:
        parts = time_str.split(":")
        if len(parts) != 2:
            return False
        hours, minutes = int(parts[0]), int(parts[1])
        return 0 <= hours <= 23 and 0 <= minutes <= 59
    except (ValueError, AttributeError):
        return False
