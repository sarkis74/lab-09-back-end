DROP TABLE IF EXISTS locations;
DROP TABLE IF EXISTS weather;

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