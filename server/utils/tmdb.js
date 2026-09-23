import dotenv from 'dotenv';
dotenv.config();

import { getOrRefreshCache } from './cacheManager.js';


const TMDB_BASE_URL = 'https://api.themoviedb.org/3';

/**
 * Search for a movie by title on TMDB
 * @param {string} title - Movie title to search for
 * @returns {Promise<object|null>} First matching movie result or null
 */
async function searchMovie(title) {
    const cacheKey = `tmdb_search_${title}`;

    if (!process.env.TMDB_API_TOKEN) {
        console.error('TMDB_API_TOKEN is not set in environment variables');
        return null;
    }

    try {
        return await getOrRefreshCache(cacheKey, async () => {
            const response = await fetch(
                `${TMDB_BASE_URL}/search/movie?query=${encodeURIComponent(title)}&include_adult=false&language=en-US&page=1`,
                {
                    headers: {
                        'Authorization': `Bearer ${process.env.TMDB_API_TOKEN}`,
                        'accept': 'application/json'
                    }
                }
            );

            if (!response.ok) {
                const errorBody = await response.text();
                throw new Error(`TMDB search failed for "${title}": ${response.status} ${errorBody}`);
            }

            const data = await response.json();
            return data.results?.[0] || null;
        }, 7 * 24 * 60 * 60 * 1000);
    } catch (error) {
        console.error(`Error searching TMDB for "${title}":`, error);
        return null;
    }
}

/**
 * Get detailed movie information including runtime, genres, etc.
 * @param {number} movieId - TMDB movie ID
 * @returns {Promise<object|null>} Movie details or null
 */
async function getMovieDetails(movieId) {
    const cacheKey = `tmdb_details_${movieId}`;

    try {
        return await getOrRefreshCache(cacheKey, async () => {
            const response = await fetch(
                `${TMDB_BASE_URL}/movie/${movieId}?language=en-US`,
                {
                    headers: {
                        'Authorization': `Bearer ${process.env.TMDB_API_TOKEN}`,
                        'accept': 'application/json'
                    }
                }
            );

            if (!response.ok) {
                throw new Error(`TMDB details failed for movie ID ${movieId}: ${response.status}`);
            }

            return response.json();
        }, 7 * 24 * 60 * 60 * 1000);
    } catch (error) {
        console.error(`Error fetching TMDB details for movie ID ${movieId}:`, error);
        return null;
    }
}

/**
 * Get streaming providers (watch providers) for a movie
 * @param {number} movieId - TMDB movie ID
 * @returns {Promise<object|null>} Watch providers by region or null
 */
async function getWatchProviders(movieId) {
    const cacheKey = `tmdb_providers_${movieId}`;

    try {
        return await getOrRefreshCache(cacheKey, async () => {
            const response = await fetch(
                `${TMDB_BASE_URL}/movie/${movieId}/watch/providers`,
                {
                    headers: {
                        'Authorization': `Bearer ${process.env.TMDB_API_TOKEN}`,
                        'accept': 'application/json'
                    }
                }
            );

            if (!response.ok) {
                throw new Error(`TMDB watch providers failed for movie ID ${movieId}: ${response.status}`);
            }

            const data = await response.json();
            return data.results;
        }, 24 * 60 * 60 * 1000);
    } catch (error) {
        console.error(`Error fetching TMDB watch providers for movie ID ${movieId}:`, error);
        return null;
    }
}

/**
 * Enrich movie data with TMDB information
 * @param {string} title - Movie title
 * @returns {Promise<object>} Enriched movie data
 */
export async function enrichMovieData(title) {
    if (!title) {
        return {};
    }

    const searchResult = await searchMovie(title);

    if (!searchResult) {
        return {};
    }

    const movieId = searchResult.id;
    const [details, providers] = await Promise.all([
        getMovieDetails(movieId),
        getWatchProviders(movieId)
    ]);

    return {
        tmdbId: movieId,
        year: searchResult.release_date ? new Date(searchResult.release_date).getFullYear() : null,
        rating: searchResult.vote_average ? Math.round(searchResult.vote_average * 10) / 10 : null,
        overview: searchResult.overview,
        runtime: details?.runtime || null,
        genres: details?.genres || [],
        watchProviders: providers?.US || null, // US providers
        posterPath: searchResult.poster_path,
        backdropPath: searchResult.backdrop_path
    };
}
