import axios from 'axios';

const GOOGLE_PLACES_API_KEY = process.env.GOOGLE_PLACES_API_KEY;
const GOOGLE_PLACES_BASE_URL = 'https://maps.googleapis.com/maps/api/place';

export interface PlaceDetails {
  place_id: string;
  name: string;
  formatted_address: string;
  geometry: {
    location: {
      lat: number;
      lng: number;
    };
  };
  price_level?: number;
  rating?: number;
  types: string[];
  photos?: Array<{
    photo_reference: string;
  }>;
}

export interface PlaceSearchParams {
  query: string;
  location?: {
    lat: number;
    lng: number;
  };
  radius?: number;
  type?: string;
}

export async function searchPlaces({
  query,
  location,
  radius = 5000,
  type,
}: PlaceSearchParams): Promise<PlaceDetails[]> {
  try {
    const response = await axios.get(`${GOOGLE_PLACES_BASE_URL}/textsearch/json`, {
      params: {
        key: GOOGLE_PLACES_API_KEY,
        query,
        ...(location && {
          location: `${location.lat},${location.lng}`,
          radius,
        }),
        ...(type && { type }),
      },
    });

    return response.data.results || [];
  } catch (error) {
    console.error('Error searching places:', error);
    return [];
  }
}

export async function getPlaceDetails(placeId: string): Promise<PlaceDetails | null> {
  try {
    const response = await axios.get(`${GOOGLE_PLACES_BASE_URL}/details/json`, {
      params: {
        key: GOOGLE_PLACES_API_KEY,
        place_id: placeId,
        fields: 'name,formatted_address,geometry,price_level,rating,types,photos',
      },
    });

    return response.data.result || null;
  } catch (error) {
    console.error('Error fetching place details:', error);
    return null;
  }
}

export function getPriceEstimate(priceLevel: number | undefined): string {
  switch (priceLevel) {
    case 0:
      return 'Free';
    case 1:
      return 'Inexpensive';
    case 2:
      return 'Moderate';
    case 3:
      return 'Expensive';
    case 4:
      return 'Very Expensive';
    default:
      return 'Price not available';
  }
} 