'use strict';

//=============
// Dependencies
//=============

const express = require('express');
const cors = require('cors');
const superagent = require('superagent');
const pg = require('pg');

require('dotenv').config();

const PORT = process.env.PORT || 3000;

//======================
// Database - PostgreSQL
//======================

const client = new pg.Client(process.env.DATABASE_URL);
client.connect();
client.on('error', err => console.log(err));

//============
// Application
//============

const app = express();

app.use(cors());

//======
// Paths
//======

app.get('/location', getLocation);

app.get('/weather', getWeather);

app.get('/yelp', getYelp);

app.get('/movies', getMovies);

app.get('/meetups', getMeetup);

app.get('/*', function(req, resp){
  resp.status(500).send('Don\'t look behind the curtain');
});

//=================
// Global Variables
//=================

let weeklyForecast = [];
let filmArray = [];
let restaurantArray = [];
let meetupArray = [];

const timeout = {
  weather: 15000,
  meetups: 86400000,
  yelp: 86400000,
  hiking: 86400000,
  movies: 86400000
}


//=========
// Handlers
//=========

//=================
// Location
//=================
function getLocation(req, res) {
  let lookupHandler = {
    cacheHit: (data) => {
      console.log('**Location: Retrieved from DB');
      res.status(200).send(data);
    },
    cacheMiss: (query) => {
      return fetchLocation(query)
        .then( result => {
          res.send(result);
        })
        .catch(error=>console.log(error))
    }
  }

  lookupLocation(req.query.data, lookupHandler);
}

function lookupLocation (query, handler) {
  console.log('**Location: Searching for record in DB');
  const SQL = 'SELECT * FROM locations WHERE search_query=$1';
  const values = [query];

  return client.query(SQL, values)
    .then(data => {
      if(data.rowCount) {
        console.log('**Location: Found in DB');
        handler.cacheHit(data.rows[0]);
      } else {
        console.log('**Location: Not found in DB, requesting from Google');
        handler.cacheMiss(query);
      }
    })
    .catch(err => console.log(err));
}

function fetchLocation (query) {
  const URL = `https://maps.googleapis.com/maps/api/geocode/json?address=${query}&key=${process.env.GEOCODE_API_KEY}`;

  return superagent.get(URL)
    .then( result => {
      console.log('**Location: Retrieved from Google');
      let location = new Location(result.body.results[0]);

      let SQL = `INSERT INTO locations
                (search_query, formatted_query, latitude, longitude) 
                VALUES($1, $2, $3, $4)`;
      
      console.log('**Location: Storing in DB')
      return client.query(SQL, [query, location.formatted_query, location.latitude, location.longitude])
        .then(() => {
          console.log('**Location: Finished storing in DB');
          return location;
        })
    })
    .catch(err => {
      console.error(err);
      res.send(err);
    })
}

//=================
// Weather
//=================
function getWeather(req, res) { // Our req represents the location object
  let lookupHandler = {
    cacheHit: (data) => {
      console.log('**Weather: Retrieved from DB');

      // Parse data
      let result = data.rows[0].weekly_forecast.map( day => {
        return JSON.parse(day);
      })

      res.status(200).send(result);
    },
    cacheMiss: (name, latitude, longitude) => {
      return fetchWeather(name, latitude, longitude)
      .then(result => {
        res.send(result)
      })
      .catch(err => console.log('========================== error in getWeather ==============================', err));
    }
  };
  let query = req.query.data;
  lookupWeather(query.formatted_query, query.latitude, query.longitude, lookupHandler);
} 

function lookupWeather(name, latitude, longitude, handler) {
  console.log('**Weather: Searching for record in DB');
  const SQL = 'SELECT * FROM weather WHERE city=$1';
  const values =[name];

  return client.query(SQL, values)
  .then(data => {
    if(data.rowCount) {
      console.log('**Weather: Found in DB');
      handler.cacheHit(data);
      
    } else {
      console.log('**Weather: Not found in DB, requesting from Darksky');
      handler.cacheMiss(name, latitude, longitude);
    }
  }) 
  .catch(err => console.log('========================== error in lookupWeather ==============================', err));
}

function fetchWeather(name, lat, long) {
  const URL = `https://api.darksky.net/forecast/${process.env.DARKSKY_API_KEY}/${lat},${long}`;
  
  return superagent.get(URL)
  .then(result => {
    console.log('**Weather: Retrieved from Darksky');
    
    weeklyForecast = []; // Clear previous weather
    const dailyForecast = result.body.daily.data;
    dailyForecast.map( ele => {
      new Forecast(ele);
    });
    
    console.log('**Weather: Storing in DB');
    let SQL = `INSERT INTO weather 
              (city, weekly_forecast)
              VALUES($1, $2)`;

    return client.query(SQL, [name, weeklyForecast])
      .then(() => {
        console.log('**Weather: Finished storing in DB');
        return weeklyForecast;
      })
  })
  .catch(err => console.log('========================== error in fetchWeather ==============================', err));
}

//=================
// Yelp
//=================
function getYelp(req, res) {
  let lookupHandler = {
    cacheHit: (data) => {
      console.log('**Yelp: Retrieved from DB');
      let result = data.rows[0].restaurant_array.map(restaurant => {
        return JSON.parse(restaurant);
      })

      res.status(200).send(result); //TODO: Data may need to be parsed
    },
    cacheMiss: (name, latitude, longitude) => {
      return fetchYelp(name, latitude, longitude)
        .then(result => {
          res.send(result);
        })
        .catch(err => console.log('========================== error in getYelp ==============================', err));
    }
  };
  let query = req.query.data;
  lookupYelp(query.formatted_query, query.latitude, query.longitude, lookupHandler);
}

function lookupYelp(name, latitude, longitude, handler) {
  console.log('**Yelp: Searching for record in DB');
  const SQL = 'SELECT * FROM restaurants WHERE city=$1';
  const values = [name];

  return client.query(SQL, values)
    .then(data => {
      if(data.rowCount) {
        console.log('**Yelp: Found in DB');
        handler.cacheHit(data);
      } else {
        console.log('**Yelp: Not found in DB, requesting from Yelp');
        handler.cacheMiss(name, latitude, longitude);
      }
    })
    .catch(err => console.log('========================== error in lookupYelp ==============================', err));
}

function fetchYelp(name, lat, long) {
  const URL = `https://api.yelp.com/v3/businesses/search?term=restaurants&latitude=${lat}&longitude=${long}&limit=20`;

  return superagent.get(URL)
    .set('Authorization', `Bearer ${process.env.YELP_API_KEY}`)
    .then(result => {
      console.log('**Yelp: Retrieved from Yelp');

      restaurantArray =[];
      const restaurantData = JSON.parse(result.text);
      restaurantData.businesses.map(business => {
        new Restaurant(business);
      })

      console.log('Yelp: Storing in DB');
      let SQL = `INSERT INTO restaurants
                (city, restaurant_array)
                VALUES($1, $2)`;

      return client.query(SQL, [name, restaurantArray])
        .then(() => {
          console.log('**Yelp: Finished storing in DB');
          return restaurantArray;
        })
    })
    .catch(err => console.log('========================== error in fetchYelp ==============================', err));
}

//=================
// Movies
//=================
function getMovies(req, res) {
  let lookupHandler = {
    cacheHit: (data) => {
    console.log('**Movies: Retrieved from DB');
    let result = data.rows[0].movie_array.map(movie => {
      return JSON.parse(movie);
    })
    res.status(200).send(result);
    },
    cacheMiss: (name) => {
      return fetchMovies(name) 
      .then(result => {
      res.send(result);
    })
    .catch(err => console.log('========================== error in getMovies ==============================', err));
  }
 };
 let query = req.query.data;
 lookupMovies(query.formatted_query, query.latitude, query.longitude, lookupHandler);
}

function lookupMovies(name, latitude, longitude, handler) {
  console.log('**Movies: Searching for record in DB');
  const SQL = 'SELECT * FROM movies WHERE city=$1';
  const values = [name];

  return client.query(SQL, values)
  .then(data => {
    if(data.rowCount) {
      console.log('**Movies: found in DB');
      handler.cacheHit(data);
    } else {
      console.log('**Movies: Not found in DB, requesting from Movie DB');
      handler.cacheMiss(name, latitude, longitude);
    }
  })
  .catch(err => console.log('========================== error in lookupMovies ==============================', err));
}

function fetchMovies(name) {
  let citySplice = name.split(',');
  const URL = `https://api.themoviedb.org/3/search/movie?api_key=${process.env.MOVIES_API_KEY}&query=${citySplice[0]}, ${citySplice[1]}`;

  return superagent.get(URL)
  .then(result => {
    console.log('**Movies: Retrieved from Movie DB'); 
    let films = result.body.results;
    films.sort( function(a, b) {
      if(a.popularity > b.popularity) return -1;
      if(b.popularity > a.popularity) return 1;
      return 0;
    })

    let numFilms = 20;
    if(films.length < 20) numFilms = films.length;

    filmArray = [];
    for(let i = 0; i < numFilms; i++) {
      filmArray.push(new Film(films[i]));
    }
    console.log('**Movies: Storing in DB');
    let SQL = `INSERT INTO movies
              (city, movie_array)
              VALUES($1, $2)`;
    
    return client.query(SQL, [name, movieArray])
    .then(()=> {
      console.log('**Movies: Finished storing in DB');
      return movieArray;
    })
  })
  .catch(err => console.log('========================== error in fetchMovies ==============================', err));
};

//=================
// Meetups
//=================
function getMeetup (req, res) {
  let lookupHandler = {
    cacheHit: data => {
      console.log('**Meetups: Retrieved from DB');
      let result = data.rows;

      res.status(200).send(result)
    },
    cacheMiss: (name, latitude, longitude, id) => {
      return fetchMeetup(name, latitude, longitude, id)
      .then(result => {
        res.send(result);
      })
      .catch(err => console.log('========================== error in getMeetup ==============================', err));
    }
  };
  let query = req.query.data;
  lookupMeetup(query.formatted_query, query.latitude, query.longitude, query.id, 'meetups', lookupHandler);
}

function lookupMeetup(name, latitude, longitude, handler) {
  console.log('**Meetups: Searching for record in DB');
  const SQL = `SELECT * FROM meetups WHERE city=$1`;
  const values = [name];
 
  return client.query(SQL, values)
  .then(data => {
    if(data.rowCount) {
      console.log('**Meetups: found in DB');
      handler.cacheHit(data);
    } else {
      console.log('**Meetups: Not found in DB, requesting from Meetup DB');
      handler.cacheMiss(name, latitude, longitude);
    }
  })
  .catch(err => console.log('========================== error in lookupMeetup ==============================', err));
}

function fetchMeetup(name) {
  const URL = `https://api.meetup.com/find/events?key=${process.env.MEETUP_API_KEY}&city=${name}&sign=true`;
 
  return superagent.get(URL)
    .then(result => {
      console.log('**Meetup: Retrieved from Meetup');

      meetupArray = JSON.parse(result.text);
      meetupArray.results.map(meetup => {
        new Meetup(meetup);
      })

      console.log('Meetup: Storing in DB');
      let SQL = `INSERT INTO meetups
                (city, meetup_array)
                VALUES($1, $2)`;

      return client.query(SQL, [name, meetupArray])
        .then(() => {
          console.log('**Meetup: Finished storing in DB');
          return meetupArray;
        })
    })
    .catch(err => console.log('========================== error in fetchMeetup ==============================', err));
}

//=============
// Constructors
//=============

function Location (location, query) {
  this.search_query = query;
  this.formatted_query = location.formatted_address; 
  this.latitude = location.geometry.location.lat;
  this.longitude = location.geometry.location.lng;
}

function Forecast (day) {  
  this.forecast = day.summary;
  
  let date = new Date(day.time * 1000);
  this.time = date.toDateString();
  
  weeklyForecast.push(this);
}

function Restaurant (business) {
  this.name = business.name;
  this.image_url = business.image_url;
  this.price = business.price;
  this.rating = business.rating;
  this.url = business.url;

  restaurantArray.push(this);
}

function Film (video) {
  this.title = video.title;
  this.overview = video.overview;
  this.average_votes = video.vote_average;
  this.total_votes = video.vote_count;
  this.image_url = 'https://image.tmdb.org/t/p/w200_and_h300_bestv2/' + video.poster_path;
  this.popularity = video.popularity;
  this.released_on = video.release_date;
}

function Meetup(meetup) {
  this.link = meetup.link;
  this.name = meetup.name;
  this.creation_date = meetup.creation_date;
  this.host = meetup.host;
}

//=========
// Listener
//=========

app.listen(PORT, () => {
  console.log('app is up on port 3000');
});

