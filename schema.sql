DROP TABLE IF EXISTS locations;
DROP TABLE IF EXISTS weather;
DROP TABLE IF EXISTS restaurants;
DROP TABLE IF EXISTS movies;

CREATE TABLE locations (
  id SERIAL PRIMARY KEY,
  search_query VARCHAR(255),
  formatted_query VARCHAR(255),
  latitude NUMERIC,
  longitude NUMERIC
);

CREATE TABLE weather (
  id SERIAL PRIMARY KEY,
  city VARCHAR(255),
  weekly_forecast TEXT[]
);

CREATE TABLE restaurants (
  id SERIAL PRIMARY KEY,
  city VARCHAR(255),
  restaurant_array TEXT[]
);

CREATE TABLE movies (
  id SERIAL PRIMARY KEY,
  city VARCHAR(255),
  movie_array TEXT[]
);