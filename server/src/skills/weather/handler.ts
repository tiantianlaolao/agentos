/**
 * Weather Skill Handler
 * Uses WeatherAPI.com (free tier: 1M calls/month).
 */

import type { SkillHandler } from '../registry.js';

interface WeatherResult {
  city: string;
  temperature: number;
  condition: string;
  humidity: number;
  windSpeed: number;
  feelsLike: number;
}

async function queryWeather(city: string): Promise<WeatherResult> {
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

  const data = (await response.json()) as {
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

/** Handler for the get_weather function */
const getWeather: SkillHandler = async (args) => {
  const city = args.city as string;
  if (!city) {
    throw new Error('City parameter is required');
  }

  const result = await queryWeather(city);
  return JSON.stringify(result);
};

/** All handlers exported for registry registration */
export const handlers: Record<string, SkillHandler> = {
  get_weather: getWeather,
};
