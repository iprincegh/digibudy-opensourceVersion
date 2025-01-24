from flask import Flask, render_template, jsonify, request, send_from_directory
import requests
import json
import os
from dotenv import load_dotenv
import logging

# logging for better debugging
logging.basicConfig(level=logging.DEBUG)
logger = logging.getLogger(__name__)

# Loading environment variables and verify the process
logger.debug("Starting application and loading environment variables")
load_dotenv(verbose=True)

def load_api_key():
    """Load and verify the API key from environment variables"""
    try:
        with open('.env', 'r') as file:
            content = file.read().strip()
            if 'ORS_API_KEY=' in content:
                api_key = content.split('ORS_API_KEY=')[1].strip()
                logger.info("Successfully read API key from .env file")
                return api_key
    except Exception as e:
        logger.error(f"Error reading .env file directly: {str(e)}")

    # Try environment variable if file reading fails
    api_key = os.getenv('ORS_API_KEY')
    if api_key:
        logger.info("Successfully loaded API key from environment")
        return api_key

    raise ValueError("Could not load API key from .env file or environment variables")

# Load the API key when starting the application
try:
    API_KEY = load_api_key()
    logger.info("API key loaded successfully")
except Exception as e:
    logger.error(f"Failed to load API key: {str(e)}")
    raise

# Main Flask application
app = Flask(__name__, static_folder='static')

@app.route('/')
def index():
    """Serve the main application page"""
    return render_template('index.html')

@app.route('/buildings')
def get_buildings():
    """Serve the GeoJSON building data"""
    try:
        logger.debug("Attempting to read building data file")
        
        file_path = os.path.join(os.getcwd(), 'static', 'data', 'digibuddy_data.geojson')
        if not os.path.exists(file_path):
            logger.error(f"Building data file not found at: {file_path}")
            return jsonify({"error": "Building data file not found"}), 404
            
        with open(file_path, 'r', encoding='utf-8') as f:
            data = json.load(f)
            
        logger.debug(f"Successfully loaded building data with {len(data.get('features', []))} features")
        return jsonify(data)
        
    except json.JSONDecodeError as e:
        logger.error(f"Invalid JSON in building data file: {str(e)}")
        return jsonify({"error": "Invalid GeoJSON format"}), 500
    except Exception as e:
        logger.error(f"Error loading building data: {str(e)}")
        return jsonify({"error": str(e)}), 500

@app.route('/get_route', methods=['POST'])
def get_route():
    """Handle routing requests between points"""
    try:
        data = request.get_json()
        logger.debug(f"Received route request with data: {data}")

        start = data.get('start')
        end = data.get('end')
        mode = data.get('mode', 'driving-car')

        url = f"https://api.openrouteservice.org/v2/directions/{mode}/geojson"

        headers = {
            'Authorization': f'Bearer {API_KEY}',
            'Content-Type': 'application/json',
            'Accept': 'application/json, application/geo+json'
        }

        body = {
            "coordinates": [
                [float(start['lng']), float(start['lat'])],
                [float(end['lng']), float(end['lat'])]
            ]
        }

        logger.debug(f"Sending request to ORS API with URL: {url}")
        logger.debug("Request headers set (API key hidden)")
        logger.debug(f"Request body: {body}")

        response = requests.post(url, json=body, headers=headers)
        
        logger.debug(f"ORS API Response Status: {response.status_code}")
        if response.status_code != 200:
            logger.error(f"Error response from API: {response.text}")
        
        response.raise_for_status()
        return jsonify(response.json())

    except requests.exceptions.RequestException as e:
        logger.error(f"Error making request to ORS: {str(e)}")
        return jsonify({"error": str(e)}), 500
    except Exception as e:
        logger.error(f"Unexpected error in route calculation: {str(e)}")
        return jsonify({"error": str(e)}), 500

if __name__ == '__main__':
    try:
        logger.info("Starting Flask application...")
        app.run(debug=True)
    except Exception as e:
        logger.error(f"Failed to start application: {str(e)}")
        raise
