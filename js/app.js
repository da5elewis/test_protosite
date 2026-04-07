(function () {
    var widget = document.getElementById('weather-widget');

    var WMO = {
      0:  { emoji: '&#x2600;&#xFE0F;',  label: 'Clear sky' },
      1:  { emoji: '&#x1F324;&#xFE0F;', label: 'Mainly clear' },
      2:  { emoji: '&#x26C5;',           label: 'Partly cloudy' },
      3:  { emoji: '&#x2601;&#xFE0F;',  label: 'Overcast' },
      45: { emoji: '&#x1F32B;&#xFE0F;', label: 'Foggy' },
      48: { emoji: '&#x1F32B;&#xFE0F;', label: 'Icy fog' },
      51: { emoji: '&#x1F326;&#xFE0F;', label: 'Light drizzle' },
      53: { emoji: '&#x1F326;&#xFE0F;', label: 'Drizzle' },
      55: { emoji: '&#x1F327;&#xFE0F;', label: 'Heavy drizzle' },
      61: { emoji: '&#x1F327;&#xFE0F;', label: 'Light rain' },
      63: { emoji: '&#x1F327;&#xFE0F;', label: 'Rain' },
      65: { emoji: '&#x1F327;&#xFE0F;', label: 'Heavy rain' },
      71: { emoji: '&#x1F328;&#xFE0F;', label: 'Light snow' },
      73: { emoji: '&#x1F328;&#xFE0F;', label: 'Snow' },
      75: { emoji: '&#x2744;&#xFE0F;',  label: 'Heavy snow' },
      77: { emoji: '&#x1F328;&#xFE0F;', label: 'Snow grains' },
      80: { emoji: '&#x1F326;&#xFE0F;', label: 'Rain showers' },
      81: { emoji: '&#x1F327;&#xFE0F;', label: 'Heavy showers' },
      82: { emoji: '&#x26C8;&#xFE0F;',  label: 'Violent showers' },
      85: { emoji: '&#x1F328;&#xFE0F;', label: 'Snow showers' },
      86: { emoji: '&#x2744;&#xFE0F;',  label: 'Heavy snow showers' },
      95: { emoji: '&#x26C8;&#xFE0F;',  label: 'Thunderstorm' },
      96: { emoji: '&#x26C8;&#xFE0F;',  label: 'Thunderstorm + hail' },
      99: { emoji: '&#x26C8;&#xFE0F;',  label: 'Thunderstorm + hail' }
    };

    function setState(html) { widget.innerHTML = html; }

    function showError(msg) {
      setState('<div class="weather-state">' + msg + '</div>');
    }

    function render(data, locationName) {
      var cw   = data.current_weather;
      var tempF = Math.round(cw.temperature);
      var condition = WMO[cw.weathercode] || { emoji: '&#x1F321;&#xFE0F;', label: 'Unknown' };
      var emoji = (cw.windspeed > 30 && [95, 96, 99].indexOf(cw.weathercode) === -1)
        ? '&#x1F4A8;' : condition.emoji;
      var editBtn = ' <button id="weather-edit-btn" title="Change location" style="font-size:0.65rem;' +
        'cursor:pointer;border:none;background:transparent;color:inherit;opacity:0.6;' +
        'padding:0 2px;vertical-align:middle">&#x270F;</button>';
      var locHtml = locationName
        ? '<div class="weather-location">' + locationName + editBtn + '</div>'
        : '<div>' + editBtn + '</div>';
      setState(
        '<div class="weather-emoji">' + emoji + '</div>' +
        '<div class="weather-temp">' + tempF + '&deg;F</div>' +
        '<div class="weather-desc">' + condition.label + '</div>' +
        locHtml
      );
      var eb = document.getElementById('weather-edit-btn');
      if (eb) { eb.addEventListener('click', showLocationPrompt); }
    }

    function fetchWeather(lat, lon) {
      return fetch(
        'https://api.open-meteo.com/v1/forecast' +
        '?latitude='          + encodeURIComponent(lat) +
        '&longitude='         + encodeURIComponent(lon) +
        '&current_weather=true' +
        '&temperature_unit=fahrenheit' +
        '&wind_speed_unit=mph'
      ).then(function (r) {
        if (!r.ok) throw new Error('Weather request failed');
        return r.json();
      });
    }

    function reverseGeocode(lat, lon) {
      return fetch(
        'https://nominatim.openstreetmap.org/reverse?lat=' +
        encodeURIComponent(lat) + '&lon=' + encodeURIComponent(lon) + '&format=json'
      ).then(function (r) {
        if (!r.ok) return null;
        return r.json().then(function (d) {
          var a    = d.address || {};
          var city = a.city || a.town || a.village || a.county || '';
          var st   = a.state_code || a.state || '';
          return (city && st) ? city + ', ' + st : (city || null);
        });
      }).catch(function () { return null; });
    }

    function searchCity(query) {
      fetch(
        'https://geocoding-api.open-meteo.com/v1/search?name=' +
        encodeURIComponent(query) + '&count=1&language=en&format=json'
      ).then(function (r) {
        if (!r.ok) throw new Error();
        return r.json();
      }).then(function (d) {
        if (!d.results || !d.results.length) {
          setState('<div class="weather-state" style="font-size:0.8rem">City not found. ' +
            '<button id="weather-retry-btn" style="cursor:pointer;border:none;background:transparent;' +
            'color:inherit;text-decoration:underline;padding:0;font-size:0.8rem">Try again</button></div>');
          var rb = document.getElementById('weather-retry-btn');
          if (rb) { rb.addEventListener('click', showLocationPrompt); }
          return;
        }
        var place = d.results[0];
        var name  = place.name + (place.admin1 ? ', ' + place.admin1 : '');
        fetchWeather(place.latitude, place.longitude)
          .then(function (data) { render(data, name); })
          .catch(function () { showError('Weather unavailable'); });
      }).catch(function () { showError('Weather unavailable'); });
    }

    function showLocationPrompt() {
      setState(
        '<form id="weather-form" style="font-size:0.78rem;line-height:1.7;text-align:center">' +
        '<input id="weather-city" type="text" placeholder="Enter a city\u2026" autocomplete="off"' +
        ' style="padding:3px 7px;border:1px solid currentColor;border-radius:4px;' +
        'background:transparent;color:inherit;font-size:0.78rem;width:110px">' +
        '<button type="submit" style="margin-left:4px;padding:3px 8px;cursor:pointer;' +
        'border:1px solid currentColor;background:transparent;border-radius:4px;' +
        'color:inherit;font-size:0.78rem">Go</button>' +
        '<div style="margin-top:4px">' +
        '<button id="weather-geo-btn" type="button" style="font-size:0.72rem;cursor:pointer;' +
        'border:none;background:transparent;color:inherit;text-decoration:underline;padding:0">' +
        '&#x1F4CD; Use my location</button></div>' +
        '</form>'
      );
      document.getElementById('weather-form').addEventListener('submit', function (e) {
        e.preventDefault();
        var query = document.getElementById('weather-city').value.trim();
        if (!query) return;
        setState('<div class="weather-state">Searching\u2026</div>');
        searchCity(query);
      });
      document.getElementById('weather-geo-btn').addEventListener('click', function () {
        function doGeoRequest() {
          setState('<div class="weather-state">Detecting location\u2026</div>');
          navigator.geolocation.getCurrentPosition(
            function (pos) {
              var lat = pos.coords.latitude;
              var lon = pos.coords.longitude;
              Promise.all([fetchWeather(lat, lon), reverseGeocode(lat, lon)])
                .then(function (res) { render(res[0], res[1]); })
                .catch(function ()   { showError('Weather unavailable'); });
            },
            function () { showLocationPrompt(); },
            { timeout: 8000 }
          );
        }
        if (navigator.permissions) {
          navigator.permissions.query({ name: 'geolocation' }).then(function (result) {
            if (result.state === 'denied') {
              setState(
                '<div class="weather-state" style="font-size:0.78rem">Location blocked for this site. ' +
                'Click the \u{1F512} icon in the address bar \u2192 <strong>Site settings</strong> \u2192 ' +
                'set <strong>Location</strong> to <em>Ask</em> or <em>Allow</em>, then reload.' +
                ' <button id="weather-back-btn" style="cursor:pointer;border:none;background:transparent;' +
                'color:inherit;text-decoration:underline;padding:0;font-size:0.78rem">Use city search</button></div>'
              );
              document.getElementById('weather-back-btn').addEventListener('click', showLocationPrompt);
            } else {
              doGeoRequest();
            }
          }).catch(function () { doGeoRequest(); });
        } else {
          doGeoRequest();
        }
      });
    }

    if (!navigator.geolocation) {
      showLocationPrompt();
      return;
    }

    function requestGeo() {
      setState('<div class="weather-state">Detecting location\u2026</div>');
      navigator.geolocation.getCurrentPosition(
        function (pos) {
          var lat = pos.coords.latitude;
          var lon = pos.coords.longitude;
          Promise.all([fetchWeather(lat, lon), reverseGeocode(lat, lon)])
            .then(function (res) { render(res[0], res[1]); })
            .catch(function ()   { showError('Weather unavailable'); });
        },
        function () { showLocationPrompt(); },
        { timeout: 8000 }
      );
    }

    if (navigator.permissions) {
      navigator.permissions.query({ name: 'geolocation' }).then(function (result) {
        if (result.state === 'denied') {
          showLocationPrompt();
        } else {
          requestGeo();
        }
      }).catch(function () { requestGeo(); });
    } else {
      requestGeo();
    }
  }());
