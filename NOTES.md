# Screenshot Generation Notes

No headless browser (Chromium / Google Chrome / Firefox) was available in the build environment (`which` returned no matches for chromium, google-chrome, or firefox). 
Therefore, `screenshots/shots.json` has been prepared with the full set of screenshot query parameters (`?shot=start`, `?shot=buy`, `?shot=play`, `?shot=end`) and expected filenames, allowing screenshot generation to be run in a browser-equipped environment if desired.
