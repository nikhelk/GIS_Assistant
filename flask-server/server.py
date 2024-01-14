from flask import Flask, jsonify, request
from flask_cors import CORS
from openai import OpenAI
import json
import ast
import time
from collections import defaultdict
from geopandas import gpd
import numpy as np
import networkx as nx
from shapely.geometry import shape

app = Flask(__name__)

client = OpenAI(api_key='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')
# assistant = client.beta.assistants.retrieve('PUT_ASSISTANTS_API_KEY_HERE')


  
CORS(app, resources={r'/api/*': {'origins': '*'}})

# Specify the path to your GeoJSON file
geojson_file = './flask-server/Buildings.geojson'
print("read file")
gdf = gpd.read_file(geojson_file)

gdf['centroid'] = gdf['geometry'].centroid
gdf['latitude'] = gdf['centroid'].y
gdf['longitude'] = gdf['centroid'].x
# Drop the 'centroid' column if you no longer need it

gdf = gdf.drop(columns=['centroid'])
gdf['area_rank'] = gdf['ShapeSTArea'].rank(ascending=False)


# Rename 'building' to 'Unnamed Building X'
unnamed_counter = 1
for i, name in enumerate(gdf['NAME_R']):
    if name == 'Building' or name == None:
        gdf.at[i, 'NAME_R'] = f'Unnamed Building {unnamed_counter}'
        unnamed_counter += 1
    # Convert GeoJSON geometry to a Shapely geometry
    shapely_geometry = shape(gdf.at[i, 'geometry'])

    # Convert to WKT (if your database uses WKT)
    wkt_geometry = shapely_geometry.wkt

    # Now `wkt_geometry` can be inserted into the database
    gdf.at[i,'geometry_strigified'] = wkt_geometry
    
    
gdf = gdf.drop(columns=['geometry'])

import sqlite3

# Create a SQLite database connection
conn = sqlite3.connect('example.db', check_same_thread=False)

# Transfer DataFrame to SQL
# Replace 'your_table_name' with your desired table name
gdf.to_sql('Buildings', conn, if_exists='replace', index=False)

# conn.enable_load_extension(True)

# # Load SpatiaLite extension
# # Replace 'mod_spatialite' with the path to the SpatiaLite module if necessary
# conn.execute('SELECT load_extension("mod_spatialite")')

# # Initialize Spatial Metadata
# conn.execute('SELECT InitSpatialMetadata(1)')
cursor = conn.cursor()


def create_haversine_function(conn):
    def haversine(lat1, lon1, lat2, lon2):
        from math import radians, sin, cos, sqrt, atan2

        # Radius of the Earth in kilometers
        R = 6371.0

        # Convert coordinates from degrees to radians
        lat1_rad, lon1_rad = radians(lat1), radians(lon1)
        lat2_rad, lon2_rad = radians(lat2), radians(lon2)

        # Differences in coordinates
        dlat = lat2_rad - lat1_rad
        dlon = lon2_rad - lon1_rad

        # Haversine formula
        a = sin(dlat / 2)**2 + cos(lat1_rad) * cos(lat2_rad) * sin(dlon / 2)**2
        c = 2 * atan2(sqrt(a), sqrt(1 - a))

        distance = R * c
        return distance

    # Create the haversine function in SQLite
    conn.create_function("haversine", 4, haversine)
create_haversine_function(conn)
print("done connection")

# Display the first few rows of the GeoDataFrame
import json
@app.route("/api/send_message", methods=['GET', 'POST'])
def send_message():
  


  PROMPT = request.json['message']
  CONVERSATION_HISTORY = request.json['conversation']
  
  fixed_conversation = ""
  length = len(CONVERSATION_HISTORY)
  count = 0 
  for elem in CONVERSATION_HISTORY:
    print(elem)
    if count == length - 1:
      break
    fixed_conversation += "sender: " + elem['sender'] + "," + "text: "+ elem['text'] + " "  + "\n"

  print("FIXED CONVERSATION ", fixed_conversation)
  print(PROMPT)
  sql_prompt = f"""
  A Table called 'Buildings' has the following relevant columns

  1. Column Name: `OBJECTID`
    - Description: A unique identifier for each building feature. It corresponds to the 'OBJECTID' field in the GeoJSON file.

  2. Column Name: `NAME_R`
    - Description: The name of the building. The database has multiple names so if other columns are dependent on a certain name, use the first instance of the name as the datapoint. Make sure to account for this when querying from this column.

  3. Column Name: `ShapeSTArea`
    - Description: A numerical value representing the calculated area of the building's shape

  4. Column Name: `latitude`
    - Description: The latitude coordinate of the building's centroid

  5. Column Name: `longitude`
    - Description: The longitude coordinate of the building's centroid

  Understand user inputs of City Hall or City of Marietta as Marietta City Hall. Also be flexible on mispellings of Marietta.

  Your goal is to understand how this data can be structured and stored in a database table using these columns. Consider how SQL queries might interact with this data for retrieval and analysis.
  use ST_ function when doing distnacte calculations. These are the only columns that you should be using sqls functions on. There is not geometry column and y
  WRITE SQL CODE TO ANSWER {PROMPT}. Do not use the TOP K syntax in SQL. In addition, use prior context from the conversation history to help you write the SQL query. Here is the conversation history that you can use to help you write the SQL query:
  {fixed_conversation}
  You should not be using ST_Distance_Sphere anywhere in the sql code. By default, do not query a geometry unless specified by the prompt. However, in the case that a geometry is being queried for, please return the 'OBJECTID' in the database coresponding to the requested entity. 
  When computing the distance between two points there is a custom function built called 'haversine' that caluclates the distance given the following parameters: (lat1, lon1, lat2, lon2)
  JSON feild for sql query that results from this analysis should be called 'sql_query'
  Please just return the query and no other information.
  """

  response = client.chat.completions.create(
    model="gpt-4-1106-preview",
    response_format={ "type": "json_object" },
    messages=[
      {"role": "system", "content": "You are a helpful assistant designed to output JSON."},
      {"role": "user", "content": sql_prompt}
    ]
  )
  fixed_response = (response.choices[0].message.content)
  fixed_response = json.loads(fixed_response)
  fixed_response = fixed_response['sql_query']
  print("SQL QUERY USED ", fixed_response)
  cursor.execute(fixed_response)
  
  
  rows = cursor.fetchall()
  sql_response = ""
  for row in rows:
      print(row)
      sql_response += str(row)
      sql_response += "\n"
  # This code needs to fix the code to get the relevant information
  map_annotations_format = """
  The map annotations should be in the following format:
  there should be a 'bot_response' feild that represent an LLM response to the user's question and a 'map_annotations' feild that contains the relevant geospatial information to be displayed on the map.
  ```json
  {
      "bot_response": A response that has the information speciifed by the user prompt. This should be a string that is the result of the query.,
    If there are no annotations to be made, have "map_annotations" be an empty list
    "map_annotations": "This field have two attributes within it: 'point_overlay' and 'geom_overlay'. Each of these attributes should be a list that contains the relevant information based on the result of the SQL query. All of these attributes depend on the result generated by the SQL query. If there are no annotations to be made, Each attribute should contain an empty list.",
    Here is an example of a geometry overlay:
        "geom_overlay":
            "geometry": This is the OBJECTID of the enitity that corresponds to the Polygon or MultiPolygon geometry that you want to overlay on the map. This should not be used unless the use of a 'geometry' overlay is specified by the user prompt. Don't base the usage of this attribute off the SQL query retreiving an OBJECTID from the query only include this based on the user prompt.
            "description": This is an array of the different descriptions of the geometry that you want to be displayed on the map. This should not be used unless the use of a 'geometry' overlay is specified by the user prompt. Don't base the usage of this attribute off the SQL query retreiving an OBJECTID from the query only include this based on the user prompt.
      Here is an example of a point overlay. Remember that this attribute is a list and every element represents one point annotation on the map:
        "point_overlay":
            "latitude": This is the latitude of the point that you want to overlay on the map, This should be used when we have a singular latitude or longitude in our datapoint returned from the sql query.
            "longitude": This is the longitude of the point that you want to overlay on the map his should be used when we have a singular latitude or longitude in our datapoint returned from the sql query.
            "description": This is an array of the different descriptions that you want to be displayed on the map
  }
  ``` 
  Always include "geom_overlay" and "point_overlay" in response. If either of them dont have any values, return an empty list for that attribute. There should not be a point_overlay and a geom_overlay for the same annotation result returned by the SQL. Chose the point_overlay over the geom_overlay in this case
  """


  organization_query= f"""
  Given prior context from the conversation history
  {fixed_conversation}
  Given this prompt by a user
  {PROMPT}

  And the following SQL Query that was formed by the prompt in context
  {sql_prompt}

  And the following reponse that was generated by the SQL Query
  {sql_response}

  Make the response in the following format:
  {map_annotations_format}
  """
  organization_query_old = f"""
  Given the following SQL Query that was formed by the prompt in context
  {sql_prompt}

  And the following reponse that was generated by the SQL Query
  {sql_response}

  Make the response in the following format:
  {map_annotations_format}
  """

  response = client.chat.completions.create(
    model="gpt-4-1106-preview",
    response_format={ "type": "json_object" },
    messages=[
      {"role": "system", "content": "You are a helpful assistant designed to output JSON. "},
      {"role": "user", "content": organization_query}
    ]
  )
  fixed_response = (response.choices[0].message.content)
  fixed_response = json.loads(fixed_response)
  print("FIXED RESPONSE ", fixed_response)

  # This code unpacks the polygon/multipolygon format because the values in the geometry columns are too big to plug into the prompt
  for elem in (fixed_response['map_annotations']['geom_overlay']):
    print()
    elem['geometry'] = gdf[gdf['OBJECTID'] == elem['geometry']]['geometry_strigified'].values[0]
  print("FINAL RESPONSE ", fixed_response)


  response = jsonify({'text_response': fixed_response['bot_response'], 'annotations': fixed_response['map_annotations'] })
  response.headers.add('Access-Control-Allow-Origin', '*')
  return response




# Have a method here that takes in calls from frontend
if __name__ == "__main__":
    app.run(debug=True)