// import React, { useRef, useEffect } from 'react';
// import {MapContainer, TileLayer} from "react-leaflet"
// import "leaflet/dist/leaflet.css";
// const App = () => {

//   console.log("start of app");
//   // useEffect(() => {
//   //   // Initialize the map
//   //   map.remove()
//   //   map = L.map('map').setView([51.505, -0.09], 13);
//   //   L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
//   //     attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
//   //   }).addTo(map);
//   // }, []);

import "leaflet/dist/leaflet.css";
import { MapContainer, TileLayer, useMap , Marker, Popup, Polygon} from 'react-leaflet'
import SelectArea from 'leaflet-area-select';
import React, { useState, useRef, useEffect } from 'react';
import axios from 'axios';
import './App.css'; // Import CSS file for styling

import L from 'leaflet';
import 'leaflet/dist/leaflet.css';


import icon from 'leaflet/dist/images/marker-icon.png';
import iconShadow from 'leaflet/dist/images/marker-shadow.png';

let DefaultIcon = L.icon({
    iconUrl: icon,
    shadowUrl: iconShadow,
    iconSize: [25,41], 
    iconAnchor: [12,41]
});

L.Marker.prototype.options.icon = DefaultIcon;

const UpdateMapView = ({ center }) => {
  const map = useMap();

  useEffect(() => {
    if (center) {
      map.setView(center, 15);
    }
  }, [center, map]);

  return null;
};


const App = () => {
  const [messages, setMessages] = useState([]); // State to hold chat messages
  const [inputValue, setInputValue] = useState(''); // State to hold user input value
  const [loading, setLoading] = useState(false);
  const inputRef = useRef(null);
  const [coordinates, setCoordinates] = useState([]);
  const [locations, setLocations] = useState([]);
  const [mapLoc, setMapLoc] = useState([33.9526, -84.5499])
  const [polygon_locations, setPolygonLocations] = useState([])
  const [selected_map_coords, setSelectedMapCoords] = useState("")



  let currentRectangle = null;
  function AreaSelect() {
    const map = useMap();
  
    useEffect(() => {
      if (!map.selectArea) return;
  
      map.selectArea.enable();
  
      if (!window.rectangleEventInitialized) {
        window.rectangleEventInitialized = true;
      map.on("areaselected", (e) => {
        
        console.log(e.bounds.toBBoxString()); // lon, lat, lon, lat
        setSelectedMapCoords(e.bounds.toBBoxString());
      
        // Remove the previous rectangle if it exists
        if (currentRectangle && map.hasLayer(currentRectangle)) {
          currentRectangle.removeFrom(map);
          map.removeLayer(currentRectangle);
        }
        console.log(currentRectangle)


        currentRectangle = L.rectangle(e.bounds, { color: "blue", weight: 1, opacity: 0.01 });
        currentRectangle.addTo(map);

      });
  
      // You can restrict selection area like this:
      const bounds = map.getBounds().pad(-0.25); // save current map bounds as restriction area
      // check restricted area on start and move
      map.selectArea.setValidate((layerPoint) => {
        return bounds.contains(this._map.layerPointToLatLng(layerPoint));
      });
  
      // now switch it off
      map.selectArea.setValidate();
    }
    }, []);
  
    return null;
  }
  
  // Function to handle user input change
  const handleInputChange = (e) => {
    setInputValue(e.target.value);
   
    
  };

  const convertData = (coordsData, namesData) => {
    // Check if the data is 1D or 2D for coordinates
    let coordsArray = !Array.isArray(coordsData[0]) ? [coordsData] : coordsData;
    // Check if the data is 1D or 2D for names
    let namesArray = !Array.isArray(namesData) ? [namesData] : namesData;
  
    // Map coordinates and names to the required format
    return coordsArray.map((point, index) => ({
      lat: point[1],
      lng: point[0],
      name: namesArray[index] || 'Unknown' // Default to 'Unknown' if no name is provided
    }));
  };



  const convertPolygonData = (coordsData, namesData) => {
    // Ensure namesData is an array
    let namesArray = !Array.isArray(namesData) ? [namesData] : namesData;
  
    // Function to reverse coordinates
    const reverseCoords = coords => {
      // Debugging log to see what coords contains
      console.log("Coords:", coords);
  
  
      // Proceed if coords is an array
      return coords.map(coord => [coord[1], coord[0]]);
  };
  
    // Check if coordsData is for a single polygon or multiple polygons
    // A single polygon would be 2D (Array of Arrays), multiple polygons would be 3D (Array of Array of Arrays)
    const isMultiPolygon = Array.isArray(coordsData[0][0]);
  
    // Map coordinates to the required format
    return coordsData.map((polygon, index) => {
      const reversedPolygon = isMultiPolygon 
        ? polygon.map(reverseCoords)  // Handle each ring in the polygon
        : reverseCoords(polygon);      // Handle a single ring
  
      return {
        poly: reversedPolygon,
        name: namesArray[index] || 'Unknown'  // Default to 'Unknown' if no name is provided
      };
    });
  };


  const getNewCenter = (coordsData) => {
    let coordsArray = !Array.isArray(coordsData[0]) ? [coordsData] : coordsData;

    let sumLong = 0, sumLat = 0;

    coordsArray.forEach(coords => {
        sumLong += coords[0]; // Assuming longitude is the first element
        sumLat += coords[1];  // Assuming latitude is the second element
    });

    let averageLong = sumLong / coordsArray.length;
    let averageLat = sumLat / coordsArray.length;

    return [averageLat, averageLong];
  };
  const convertCoordinates = (data) => {
    // Check if the data is a 1D array (single coordinate)
    if (!Array.isArray(data[0])) {
      // Convert the single coordinate to the required format
      return [{ lat: data[1], lng: data[0] }];
    } else {
      // Map each coordinate to the required format
      return data.map(point => ({ lat: point[1], lng: point[0] }));
    }
  };


  function fixArray(arr) {
    return arr.map(item => {
        // If an item is an array and its first element is also an array,
        // then take the first element of this nested array.
        // Otherwise, return the item as it is.
        return Array.isArray(item) && Array.isArray(item[0]) ? item[0] : item;
    });
}


useEffect(() => {
  console.log("Updated locations:", locations);
}, [locations]); // This useEffect will run whenever 'locations' changes
  // Function to handle user message submission
const [conversationHistory, setConversationHistory] = useState([]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    console.log(inputValue);
    if (inputValue.trim() !== '') {
      const inputVal = inputValue.trim();
      var to_api_string = inputVal
      if (selected_map_coords != "") 
      {
        to_api_string += " answer the question based on the area defined by the following two long, lat coordinates " + selected_map_coords
      }
      console.log(inputValue);
      setInputValue('');
      const updatedHistory = [...conversationHistory, { text: to_api_string, sender: 'user' }];
      setConversationHistory(updatedHistory);
      console.log(conversationHistory)
      setMessages([...messages, { text: inputVal, sender: 'user' }]);
      setLoading(true);
      if (1 == 1) {
      try {

        //const response = await axios.post('https://sagesgpt-prod.herokuapp.com//api/send_message', { message: inputVal });
        const response = await axios.post('http://127.0.0.1:5000//api/send_message', { message: to_api_string , conversation: updatedHistory});
        console.log(response.data);
        const botResponse = response.data.text_response;
        console.log(typeof response.data.annotations.point_overlay)
        console.log( response.data.annotations.point_overlay.length)


        if (response.data.annotations.point_overlay.length > 0) {
          console.log("there are point overlays in the response")
          console.log(response.data.annotations.point_overlay)

          const newLocations = response.data.annotations.point_overlay.map(input => {
            const { description, latitude, longitude } = input;
            if (input.latitude == null || input.longitude == null || input.description == undefined) {
              return null;
            }
            return {
              lat: latitude,
              lng: longitude,
              description: description[0] // Assuming you want the first description from the array
            };
          });
          // Update the state with the new locations
          setLocations(newLocations);
          setMapLoc([newLocations[0].lat, newLocations[0].lng])

        } else {
          if (response.data.annotations.point_overlay.latitude != undefined )  {
          console.log("there are point overlays in the response one")
          console.log(response.data.annotations.point_overlay)

          const { description, latitude, longitude } = response.data.annotations.point_overlay;
          const location = {
            lat: latitude,
            lng: longitude,
            description: description[0] // Assuming you want the first description
          };
          // Update the state with the new location
          setLocations([location]); // Use an array to handle multiple locations
          setMapLoc([location.lat, location.lng])

        }

        }
        
        // setMapLoc([response.data.latitude, response.data.longitude])

        
        
        setMessages([...messages, 
          {text: inputVal, sender: 'user'},
          {text: botResponse, sender: 'chatbot'},
        ]);
        setConversationHistory([...updatedHistory,  {text: botResponse, sender: 'chatbot' }]);
  //       const latitude = response.data.latitude;
  //       const longitude = response.data.longitude;
  //       const annotation_data = response.data.annotation_data;
        
  //       let list_of_points = annotation_data.list_of_points;
  //       if ((list_of_points) != undefined) {
  //       list_of_points = fixArray(list_of_points);
  //       }


  //       const list_of_polygons =  annotation_data.list_of_polygons;



  //       let building_names = annotation_data.building_name;

  //       if ((building_names) != undefined) {
  //       for (let i = 0; i < building_names.length; i++) {
  //         if (Array.isArray(building_names[i])) {
  //             // Replace the nested array with its elements
  //             building_names[i] = building_names[i][0]
  //         }
  //     }
  //   }

  //     let name_description = annotation_data.name_description;

  //     if ((name_description) != undefined) {
  //     for (let i = 0; i < name_description.length; i++) {
  //       if (Array.isArray(name_description[i])) {
  //           // Replace the nested array with its elements
  //           name_description[i] = name_description[i][0]
  //       }
  //   }
  // }
  //     let list_of_points_fixed = list_of_points
  //       setMessages([...messages, 
  //         {text: inputVal, sender: 'user'},
  //         {text: botResponse, sender: 'chatbot'},
  //       ]);

  //       if (list_of_points_fixed != undefined && building_names != undefined) {
  //       const locationsData = convertData(list_of_points_fixed, building_names);
  //       setLocations(locationsData);
  //       }
  //       if (list_of_polygons != undefined && name_description != undefined) {

  //         let result = list_of_polygons.map((polygon, index) => {
  //           console.log("polygon")
  //           console.log(polygon)
  //           return {
  //               name: name_description[0],
  //               poly: polygon.map(coord => [coord[1], coord[0]])
  //           };
  //       });
  //       // const locationsData_polygons = convertPolygonData(list_of_polygons, name_description )
  //       console.log("RESULTTTT")
  //       console.log(result)

  //       setPolygonLocations(result)
  //       }

  //       if (list_of_points_fixed != undefined) {
  //       const newCenter = getNewCenter(list_of_points_fixed)
  //       console.log("BRUHHHH")
  //       console.log(newCenter)
  //       setMapLoc(newCenter)
  //       console.log(locations)
  //       console.log(mapLoc)
  //       } 
        
  //       else {
  //         setMapLoc([33.9526, -84.5499])
  //       }

      } catch (error) {
        console.error('Error:', error);
      }
    }
      setLoading(false)
      
    }
  };
  const handleClearChat = () => {
    setMessages([]);
  };
  useEffect(() => {
    const inputElement = inputRef.current;
    inputElement.style.height = 'auto';
    inputElement.style.height = `${inputElement.scrollHeight-7}px`;
  }, [inputValue]);


  return (
    <div className="app-container">
  <div className="chatbot-container">
    <div className="chatbot-header">Map Finder</div>
    <div className="chatbot-messages">
      {messages.map((message, index) => (
        <div
          key={index}
          className={`chatbot-message ${message.sender === 'user' ? 'user' : 'chatbot'}`}
        >
          {message.text}
        </div>
      ))}
    </div>
    <form className="chatbot-input" onSubmit={handleSubmit}>
    <textarea
        ref={inputRef}
        className="chatbot-textarea"
        placeholder="Type a message..."
        value={inputValue}
        onChange={handleInputChange}
      />
      <button type="submit" disabled={loading}>Send</button>
      {loading && (
      <div className="loading-container">
        <div className="loading-icon"></div>
      </div>
    )}
    </form>

    <button className="clear-button" onClick={handleClearChat}>Clear</button>
  </div>
  <div className="map-container">

{/* 
<MapContainer center={coordinates[0] ? [coordinates[0].lat, coordinates[0].lng] : [33.9526, -84.5499]} zoom={13} style={{height: "100vh"}}>
    <TileLayer
      url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
    />
    {coordinates.map((coord, index) => (
      <Marker key={index} position={[coord.lat, coord.lng]} />
    ))}
  </MapContainer> */}

  <MapContainer center={mapLoc} zoom={6} style={{height: "100vh"}}>
    <TileLayer
      url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
    />
    <AreaSelect />
    
{
  locations && locations.length > 0 ? (
    locations.map((location, index) => (
      <Marker key={index} position={[location.lat, location.lng]}>
        {<Popup>{location.description}</Popup>}
      </Marker>
    ))
  ) : (
    <div></div> // or simply null if you don't want to render anything
  )
}
{
  polygon_locations && polygon_locations.length > 0 ? (
    polygon_locations.map((location, index) => (
      <Polygon key={index} positions={location.poly}>
        <Popup>{location.name}</Popup>
      </Polygon>
    ))
  ) : (
    <div></div> // or simply return null if you don't want to render anything
  )
}
    <UpdateMapView center={mapLoc} />
  </MapContainer>

    </div>

      </div>

  );
}
export default App;


// <MapContainer center={[48.8566, 2.3522]} zoom={13}>
// {/* OPEN STREEN MAPS TILES */}
// <TileLayer
//   attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
//   url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
// />
// </MapContainer>



// // Define your Overpass API query
// var overpassQuery = `
//     [out:json];
//     node
//       [amenity=restaurant]
//       ({{bbox}});
//     out;
// `;

// // Function to make the Overpass API request
// function requestData() {
//     var bounds = map.getBounds();
//     var query = overpassQuery.replace('{{bbox}}', `${bounds.getSouth()},${bounds.getWest()},${bounds.getNorth()},${bounds.getEast()}`);

//     fetch(`https://overpass-api.de/api/interpreter?data=${encodeURIComponent(query)}`)
//         .then(response => response.json())
//         .then(data => {
//             // Process the Overpass data and add it to the map
//             data.elements.forEach(element => {
//                 if (element.type === "node") {
//                     L.marker([element.lat, element.lon]).addTo(map)
//                         .bindPopup(element.tags.name || "No name");
//                 }
//             });
//         })
//         .catch(error => console.error('Error fetching Overpass data:', error));
// }

// // Request data when the map is moved or zoomed
// map.on('moveend', requestData);

// // Initial data request
// requestData();
