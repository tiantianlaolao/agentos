import type { SkillDefinition } from '../types/protocol.js';

/**
 * Weather skill - hardcoded for MVP.
 * Uses WeatherAPI.com (free tier: 1M calls/month).
 */

export const weatherSkillDef: SkillDefinition = {
  name: 'weather',
  description: 'Query current weather for a city',
  parameters: {
    city: {
      type: 'string',
      description: 'City name, e.g. "Beijing" or "Tokyo"',
      required: true,
    },
  },
};

export interface WeatherResult {
  city: string;
  temperature: number;
  condition: string;
  humidity: number;
  windSpeed: number;
  feelsLike: number;
}

export async function queryWeather(city: string): Promise<WeatherResult> {
  const apiKey = process.env.WEATHER_API_KEY;
  const baseUrl = process.env.WEATHER_API_URL || 'https://api.weatherapi.com/v1';

  if (!apiKey) {
    throw new Error('WEATHER_API_KEY not configured');
  }

  const url = `${baseUrl}/current.json?key=${encodeURIComponent(apiKey)}&q=${encodeURIComponent(city)}&aqi=no`;
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`Weather API error: ${response.status} ${response.statusText}`);
  }

  const data = await response.json() as {
    location: { name: string };
    current: {
      temp_c: number;
      condition: { text: string };
      humidity: number;
      wind_kph: number;
      feelslike_c: number;
    };
  };

  return {
    city: data.location.name,
    temperature: data.current.temp_c,
    condition: data.current.condition.text,
    humidity: data.current.humidity,
    windSpeed: data.current.wind_kph,
    feelsLike: data.current.feelslike_c,
  };
}
