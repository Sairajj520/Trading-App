from flask import Flask
from flask_socketio import SocketIO, emit
from flask_cors import CORS
import csv
import time
import os
import threading

app = Flask(__name__)
CORS(app, resources={r"/*": {"origins": "*"}})
socketio = SocketIO(app, cors_allowed_origins="*", async_mode='threading')

# Global state
streaming_active = False
streaming_thread = None

def stream_csv_data():
    global streaming_active
    
    # Find CSV file
    csv_files = [f for f in os.listdir('.') if f.endswith('.csv')]
    if not csv_files:
        socketio.emit('stream_error', {'error': 'No CSV file found'})
        return
    
    csv_file = csv_files[0]
    
    try:
        with open(csv_file, 'r') as f:
            reader = csv.DictReader(f)
            headers = reader.fieldnames
            
            # Send headers first
            socketio.emit('stream_started', {
                'headers': list(headers),
                'filename': csv_file
            })
            
            # Stream rows one by one
            for row in reader:
                if not streaming_active:
                    break
                
                #(Algorithm Calculations)
                
                socketio.emit('new_row', dict(row))
                
                # Server controls timing - adjust as needed
                time.sleep(1)  # 1 second per row
            
            # Stream completed
            socketio.emit('stream_ended', {})
            
    except Exception as e:
        socketio.emit('stream_error', {'error': str(e)})
    finally:
        streaming_active = False

@socketio.on('connect')
def handle_connect():
    print('Client connected')

@socketio.on('disconnect')
def handle_disconnect():
    global streaming_active
    streaming_active = False
    print('Client disconnected')

@socketio.on('start_streaming')
def handle_start_streaming():
    global streaming_active, streaming_thread
    
    if streaming_active:
        emit('stream_error', {'error': 'Already streaming'})
        return
    
    streaming_active = True
    streaming_thread = threading.Thread(target=stream_csv_data)
    streaming_thread.start()

@socketio.on('stop_streaming')
def handle_stop_streaming():
    global streaming_active
    streaming_active = False
    emit('stream_stopped', {})

if __name__ == '__main__':
    socketio.run(app, host='0.0.0.0', port=8080, debug=True)
