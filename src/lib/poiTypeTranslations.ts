/**
 * Translations from Italian POI types to English
 * Based on 1740s Venetian merchant and shop types
 */

export const POI_TYPE_TRANSLATIONS: Record<string, string> = {
  // Food & Beverage
  "FORNO": "Bakery",
  "PISTOR": "Baker",
  "PISTORIA": "Bakery Shop",
  "LUGANEGHER": "Sausage Maker",
  "FRUTARIOL": "Fruit Vendor",
  "NARANZER": "Orange Seller",
  "ERBARIOL": "Herbalist",
  "SPECIER": "Spice Merchant",
  "MALVASIA": "Wine Tavern",
  "LOCANDA": "Inn",
  "TABACCO": "Tobacco Shop",
  "OGLIO,MANDOLER": "Oil & Almond Seller",
  "ORTO": "Garden",
  
  // Artisans & Craftsmen
  "CALEGHER": "Shoemaker",
  "SARTOR": "Tailor",
  "CAPELER": "Hat Maker",
  "BARBIER": "Barber",
  "TAGLIAPIETRA": "Stone Cutter",
  "MARANGON": "Carpenter",
  "FABRO": "Blacksmith",
  "ZAVATER": "Cobbler",
  "ORESE": "Goldsmith",
  "TENTOR": "Dyer",
  "LAVAZER": "Launderer",
  "INTAGLIADOR": "Engraver",
  "MARZER": "Haberdasher",
  "PIRIER": "Pewter Smith",
  "DROGHER": "Druggist",
  
  // Furniture & Household
  "CAREGHETTA": "Chair Maker",
  "CASSELER": "Chest Maker",
  "BOTTER": "Cooper (Barrel Maker)",
  "MASTELLER": "Tub Maker",
  
  // Commerce & Services
  "LIBRER": "Bookseller",
  "CARTER": "Paper Maker",
  "CORRONER": "Leather Worker",
  "GALINER": "Chicken Seller",
  "CALCE": "Lime Seller",
  
  // Institutions
  "SCUOLA": "School/Guild Hall",
  "OSPIZIO": "Hospice",
  "TEATRO": "Theater",
  "CASINO": "Casino/Club",
  
  // Landmarks
  "LANDMARK": "Landmark",
};

/**
 * Get English translation for a POI type
 */
export function translatePoiType(type: string): string {
  return POI_TYPE_TRANSLATIONS[type] || type;
}
