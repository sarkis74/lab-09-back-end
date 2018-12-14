'use strict';

// Dependencies

const express = require('express');
const cors = require('cors');
const superagent = require('superagent');
const pg = require('pg');

require('dotenv').config();

const PORT = process.env.PORT || 3000;

// PostgreSQL
const client = new pg.Client(process.env.DATABASE_URL);
client.connect();
client.on('error', err => console.log(err));

// App

const app = express();

app.use(cors());

// Routes

app.get('/location', getLocation);

// app.get('/weather', (req, resp) => {
//   return weatherHandler(req.query.data.latitude, req.query.data.longitude)
//     .then( (latLong) => {
//       resp.send(latLong);
//     });

// });

// app.get('/yelp', (req, resp) => {
//   return yelpHandler(req.query.data)
//     .then( (yelp) => {
//       resp.send(yelp);
//     });
// });

// app.get('/movies', (req, resp) => {
//   return movieHandler(req.query.data)
//     .then( (movies) => {
//       resp.send(movies);
//     });
// });

// app.get('/*', function(req, resp){
//   resp.status(500).send('Don\'t look behind the curtain');
// });

// Global Variables
let weeklyForecast = [];
let filmArray = [];
let restaurantArray = [];


// Handlers

function getLocation(req, res) {
  let lookupHander = {
    cacheHit: (data) => {
      console.log('Location retrieve from DB');
      res.status(200).send(data.rows[0]);
    },
    cacheMiss: (query) => {
      return fetchLocation(query)
        .then( result => {
          res.send(result);
        })
        .catch(error=>console.log('Error in getLocation()', error))
    }
  }

  lookupLocation(req.query.data, lookupHander);
}

function lookupLocation (query, handler) {
  const SQL = 'SELECT * FROM locations WHERE search_query=$1';
  const values = [query];

  return client.query(SQL, values)
    .then(data => {
      if(data.rowCount) {
        handler.cacheHit(data);
      } else {
        handler.cacheMiss(query);
      }
    })
    .catch(err => console.log(err));
}

function fetchLocation (query) {
  const URL = `https://maps.googleapis.com/maps/api/geocode/json?address=${query}&key=${process.env.GEOCODE_API_KEY}`;

  return superagent.get(URL)
    .then( result => {
      console.log('Location retrieved from Google Geocode API');
      let location = new Location(result.body.results[0]);
      let SQL = `INSERT INTO locations
                (search_query, formatted_query, latitude, longitude) 
                VALUES($1, $2, $3, $4)`;
      
      return client.query(SQL, [query, location.formatted_query, location.latitude, location.latitude])
        .then(() => {
          return location;
        })
    })
    .catch(err => {
      console.error(err);
      res.send(err);
    })
}

// function latLongHandler (query) {
//   let locationData = `https://maps.googleapis.com/maps/api/geocode/json?address=${query}&key=${process.env.GEOCODE_API_KEY}`;
  
//   return superagent.get(locationData)
//     .then( geoData => {
//       const location = new Location(geoData.body.results[0]);
//       return location;
//     })
//     .catch( err => console.error(err));
// }

// function weatherHandler (lat, long) {
//   let weatherData = `https://api.darksky.net/forecast/${process.env.DARKSKY_API_KEY}/${lat},${long}`;

//   return superagent.get(weatherData)
//     .then( forecastData => {
//       const dailyForecast = forecastData.body.daily.data;
//       dailyForecast.map( ele => {
//         new Forecast(ele);
//       });
//       return weeklyForecast;
//     })
// }

// function yelpHandler (query) {
//   let lat = query.latitude;
//   let long = query.longitude;

//   let yelpData = `https://api.yelp.com/v3/businesses/search?term=restaurants&latitude=${lat}&longitude=${long}&limit=20`;

//   return superagent.get(yelpData)
//     // This .set() adds our API KEY
//     .set('Authorization', `Bearer ${process.env.YELP_API_KEY}`)
//     .then( restaurantData => {
//       // The return is a mess that needs to be parsed
//       restaurantData = JSON.parse(restaurantData.text);
//       restaurantData.businesses.map( business => {
//         new Restaurant(business);
//       })
//       return restaurantArray;
//     })
//     .catch( err => {
//       console.error(err)
//     });
// }

// function movieHandler (query) {
//   let citySplice = query.formatted_query.split(',');
//   let movieData = `https://api.themoviedb.org/3/search/movie?api_key=${process.env.MOVIES_API_KEY}&query=${citySplice[0]}, ${citySplice[1]}`;
  
//   return superagent.get(movieData)
//     .then( filmData => {
//       let films = filmData.body.results;//array of results
//       // Sort Films by Popularity
//       films.sort( function (a,b) {
//         if( a.popularity > b.popularity) return -1;
//         if( b.popularity > a.popularity) return 1;
//         return 0;
//       });
//       //If # of films less than 20
//       let numFilms = 20;
//       if(films.length < 20) numFilms = films.length;
//       //For Loop over first 20 films
//       filmArray = [];
//       for(let i = 0 ; i < numFilms ; i++) {
//         //create film objects and push into array.
//         filmArray.push(new Film (films[i]));
//       }
//       return filmArray;
//     });
// }

// Constructors

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

// Checks

app.listen(PORT, () => {
  console.log('app is up on port 3000');
});

