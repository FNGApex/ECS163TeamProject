Tallest Buildings D3 Upgrade

Files included:
- index.html
- style.css
- main.js
- data/  (put your buildings.csv here)

How to use:
1. Copy your existing buildings.csv into the data folder.
2. Make sure the file name is exactly: data/buildings.csv
3. Open the folder using VS Code Live Server or another local server.
4. Do not open index.html directly by double-clicking, because d3.csv may be blocked by browser file rules.

Expected CSV columns:
The code is flexible and can read common column names such as:
rank / Rank
name / Name / Building Name
height / Height / Height (m)
floors / Floors
year / Year / Year Built / Completed
city / City
country / Country
lat / latitude / Latitude
lon / lng / longitude / Longitude

Main improvements:
- Building-shape skyline comparison using the same height scale.
- Click a map point or building shape to select it.
- Selected building details panel.
- Yellow connection line between selected map marker and selected skyline building.
- Map zoom and pan.
- Timeline brush filter.
- Search, country filter, top-N slider, and reset button.
- Animated transitions for building height and map markers.

Update: two-building comparison mode
- Use the Building A and Building B dropdowns in the right panel to compare any two specific towers.
- You can also click a building once to set A, then click a second different building to set B.
- The skyline and map highlight both buildings and show two reference height lines.
