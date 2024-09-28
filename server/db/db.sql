-- Active: 1725690503019@@127.0.0.1@5432@scareathon
-- Drop existing tables if they exist
DROP TABLE IF EXISTS leaderboards;

DROP TABLE IF EXISTS game_specific_data;

DROP TABLE IF EXISTS games;

DROP TABLE IF EXISTS users;

-- Create users table (keeping UUID as is)
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY,
    username VARCHAR(50) UNIQUE NOT NULL,
    email VARCHAR(100) UNIQUE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create games table with auto-incrementing id
CREATE TABLE IF NOT EXISTS games (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) UNIQUE NOT NULL,
    description TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create game_specific_data table with auto-incrementing id
CREATE TABLE IF NOT EXISTS game_specific_data (
    id SERIAL PRIMARY KEY,
    user_id UUID REFERENCES users (id),
    game_id INTEGER REFERENCES games (id),
    data_type VARCHAR(50) NOT NULL,
    data JSONB NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (user_id, game_id, data_type)
);

-- Create leaderboards table with auto-incrementing id
CREATE TABLE IF NOT EXISTS leaderboards (
    id SERIAL PRIMARY KEY,
    game_id INTEGER REFERENCES games (id),
    user_id UUID REFERENCES users (id),
    metric_name VARCHAR(50) NOT NULL,
    metric_value NUMERIC NOT NULL,
    achieved_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (game_id, user_id, metric_name)
);

-- Add indexes for performance (optional but recommended)
CREATE INDEX idx_game_specific_data_user_game ON game_specific_data (user_id, game_id);

CREATE INDEX idx_leaderboards_game_metric ON leaderboards (
    game_id,
    metric_name,
    metric_value DESC
);