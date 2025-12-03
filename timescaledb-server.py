import eventlet
eventlet.monkey_patch()
import json
from flask import Flask, jsonify, request
from flask_cors import CORS
from flask_socketio import SocketIO, emit, disconnect
import psycopg2
import datetime
from datetime import timezone, timedelta
import jwt
from flask_socketio import SocketIO, emit, disconnect, join_room, leave_room

# ---------------------------
# DB CONFIG 
# ---------------------------
APP_SECRET = "admin"
JWT_ALGORITHM = "HS256"
DB_CONFIG = {
    'host': 'localhost',
    'port': 5436,
    'database': 'timescale',
    'user': 'postgres',
    'password': 'postgres'
}

# Simple demo user store
USERS = {
    "admin": "admin"
}
# ---------------------------

app = Flask(__name__)
app.config['SECRET_KEY'] = APP_SECRET
CORS(app, resources={r"/*": {"origins": "*"}})

# SocketIO using eventlet
socketio = SocketIO(app, cors_allowed_origins="*", async_mode='eventlet', message_queue='redis://localhost:6379/0')
client_sessions = {}  # sid -> { user, token, rooms:set(), ... }

# symbol -> set(sid) of subscribers (local process only)
symbol_subscribers = {}  # {'AAPL': set([sid1, sid2])}

# symbol -> background task object / control flag
symbol_tasks = {}  # {'AAPL': {'running': True, 'task': task_obj}}

def get_db_connection():
    try:
        return psycopg2.connect(**DB_CONFIG)
    except Exception as e:
        print("DB conn error:", e)
        return None


# ---------------------------
# Utility: fetch all candles joined with signals
# ---------------------------
def fetch_all_candles_for_symbol(symbol):
    conn = get_db_connection()
    if not conn:
        return {'error': 'DB connection failed'}
    try:
        cursor = conn.cursor()
        query = """
        SELECT 
        c.ts,
        c.symbol,
        c.open,
        c.high,
        c.low,
        c.close,
        c.volume,
        s.algo,
        s.value,
        s.attributes
        FROM candles c
        LEFT JOIN signals s
            ON c.symbol = s.symbol
           AND c.ts = s.ts
        WHERE c.symbol = %s
        ORDER BY c.ts ASC;
        """
        cursor.execute(query, (symbol,))
        rows = cursor.fetchall()
        cursor.close()
        conn.close()

        ist = timezone(timedelta(hours=5, minutes=30))
        candle_map = {}
        for ts, sym, o, h, l, c, v, algo, value, attributes in rows:
            key = ts.isoformat()
            if key not in candle_map:
                candle_map[key] = {
                    "time": int(ts.astimezone(ist).timestamp()),
                    "symbol": sym,
                    "open": float(o),
                    "high": float(h),
                    "low": float(l),
                    "close": float(c),
                    "volume": float(v or 0)
                }
            if algo:
                if algo.lower() == 'bs':
                    candle_map[key]['bs'] = int(value) if value is not None else None
                else:
                    try:
                        candle_map[key][algo] = float(value) if value is not None else None
                    except:
                        candle_map[key][algo] = value

                # attributes parsing
                    if attributes:
                        try:
                            if isinstance(attributes, str):
                                attributes = json.loads(attributes)

                # extract indicator color from DB attributes
                            if isinstance(attributes, dict) and "color" in attributes:
                                candle_map[key][f"{algo}_color"] = attributes["color"]

                        except Exception as e:
                            print("Attributes parse error:", e)


        # return list ordered by time
        result = list(candle_map.values())
        result.sort(key=lambda x: x['time'])
        return result
    except Exception as e:
        print("fetch_all_candles_for_symbol error:", e)
        if conn:
            conn.close()
        return {'error': str(e)}


# ---------------------------
# HTTP: Login (returns JWT)
# ---------------------------
@app.route('/api/login', methods=['POST'])
def api_login():
    data = request.get_json() or {}
    username = data.get('username')
    password = data.get('password')
    if not username or not password:
        return jsonify({'error': 'username & password required'}), 400
    if USERS.get(username) == password:
        payload = {
            'user': username,
            'exp': datetime.datetime.now(datetime.UTC) + datetime.timedelta(hours=8)

        }
        token = jwt.encode(payload, APP_SECRET, algorithm=JWT_ALGORITHM)
        if isinstance(token, bytes):
            token = token.decode('utf-8')
        return jsonify({'token': token})
    return jsonify({'error': 'Invalid credentials'}), 401

# ---------------------------
@app.route('/api/load-history', methods=['GET'])
def load_history():
    symbol = request.args.get('symbol', 'AAPL')
    data = fetch_all_candles_for_symbol(symbol)
    if isinstance(data, dict) and 'error' in data:
        return jsonify(data), 500
    return jsonify({'success': True, 'data': data})


# ---------------------------
# Socket.IO: per-client session store and events
# ---------------------------
client_sessions = {}  # sid -> { user, token, symbol, index, candles }

def verify_token(token):
    try:
        decoded = jwt.decode(token, APP_SECRET, algorithms=[JWT_ALGORITHM])
        return decoded
    except Exception as e:
        return None


@socketio.on('connect')
def socket_connect():
    sid = request.sid
    print(f"Socket connected: {sid}")
    client_sessions[sid] = {'running': False, 'rooms': set()}
    emit('connected', {'msg': 'connected'})



@socketio.on('auth')
def socket_auth(payload):
    sid = request.sid
    token = (payload or {}).get('token')
    if not token:
        emit('auth_response', {'success': False, 'error': 'no token provided'})
        return
    decoded = verify_token(token)
    if not decoded:
        emit('auth_response', {'success': False, 'error': 'invalid token'})
        return
    # set session identity
    client_sessions[sid]['user'] = decoded.get('user')
    client_sessions[sid]['token'] = token
    emit('auth_response', {'success': True, 'user': decoded.get('user')})
    print(f"[{sid}] authenticated as {decoded.get('user')}")


@socketio.on('subscribe')
def on_subscribe(payload):
    """
    payload: { token, symbols: ['AAPL','TSLA'], speed: 1000 }
    """
    sid = request.sid
    sess = client_sessions.get(sid)
    if not sess:
        emit('error', {'msg': 'session not found'})
        return

    token = (payload or {}).get('token')
    decoded = verify_token(token)
    if not decoded:
        emit('auth_response', {'success': False, 'error': 'Unauthorized'})
        return

    symbols = (payload or {}).get('symbols') or []
    speed = int((payload or {}).get('speed') or 1000)

    for symbol in symbols:
        room = f"sym:{symbol}"
        join_room(room)
        sess['rooms'].add(room)

        # add subscriber in local map
        subscribers = symbol_subscribers.get(symbol, set())
        subscribers.add(sid)
        symbol_subscribers[symbol] = subscribers

    emit('subscribed', {'symbols': symbols})


@socketio.on('unsubscribe')
def on_unsubscribe(payload):
    sid = request.sid
    sess = client_sessions.get(sid)
    if not sess:
        return
    symbols = (payload or {}).get('symbols') or []
    for symbol in symbols:
        room = f"sym:{symbol}"
        try:
            leave_room(room)
        except Exception:
            pass
        sess['rooms'].discard(room)

        subscribers = symbol_subscribers.get(symbol, set())
        subscribers.discard(sid)
        if not subscribers:
            symbol_subscribers.pop(symbol, None)
            stop_symbol_playback(symbol)
        else:
            symbol_subscribers[symbol] = subscribers

    emit('unsubscribed', {'symbols': symbols})



@socketio.on('stop_stream')
def on_stop_stream():
    sid = request.sid
    sess = client_sessions.get(sid)
    if sess:
        sess['running'] = False
    emit('stopped', {'msg': 'stream stopped'})


@socketio.on('disconnect')
def socket_disconnect():
    sid = request.sid
    print(f"Socket disconnected: {sid}")
    sess = client_sessions.get(sid)
    if sess:
        # remove sid from all symbol_subscribers
        for room in list(sess.get('rooms', [])):
            # room format sym:SYMBOL
            if room.startswith('sym:'):
                symbol = room.split(':', 1)[1]
                subscribers = symbol_subscribers.get(symbol, set())
                subscribers.discard(sid)
                if not subscribers:
                    # stop playback for symbol if no local subscribers remain
                    stop_symbol_playback(symbol)
                else:
                    symbol_subscribers[symbol] = subscribers
        client_sessions.pop(sid, None)

@socketio.on('start_stream')
def on_start_stream(payload):
    token = payload.get('token')
    symbol = payload.get('symbol')
    speed = int(payload.get('speed') or 1000)

    decoded = verify_token(token)
    if not decoded:
        emit('auth_response', {'success': False, 'error': 'invalid token'})
        return

    sid = request.sid
    room = f"sym:{symbol}"

    join_room(room)

    subscribers = symbol_subscribers.get(symbol, set())
    subscribers.add(sid)
    symbol_subscribers[symbol] = subscribers

    # NOW start playback
    start_symbol_playback(symbol, speed)

    emit('started', {'msg': 'simulation started', 'symbol': symbol})

def stream_thread(sid):
    while True:
        sess = client_sessions.get(sid)
        if not sess:
            return

        if not sess.get('running'):
            try:
                socketio.emit('end', {'msg': 'stream ended'}, to=sid)
            except:
                pass
            return

        idx = sess.get('index', 0)
        candles = sess.get('candles', [])

        if idx >= len(candles):
            sess['running'] = False
            socketio.emit('end', {'msg': 'end of data'}, to=sid)
            return

        row = candles[idx]

        print("row: Object")

        socketio.emit('candle', row, to=sid)
        sess['index'] = idx + 1
        eventlet.sleep(sess.get('speed', 1000) / 1000.0)

def start_symbol_playback(symbol, speed_ms=1000):
    """
    Start a background playback task for `symbol` if not already running.
    The task fetches candles once and emits them to room 'sym:SYMBOL'.
    """
    if symbol in symbol_tasks:
        return

    control = {'running': True}
    symbol_tasks[symbol] = {'control': control, 'task': None}

    def play():
        # fetch candles once 
        candles = fetch_all_candles_for_symbol(symbol)
        if isinstance(candles, dict) and 'error' in candles:
            print(f"Playback fetch error for {symbol}: {candles}")
            return

        idx = 0
        while control['running'] and idx < len(candles):
            row = candles[idx]
            # include symbol field if missing
            if 'symbol' not in row:
                row['symbol'] = symbol

            # emit to all subscribers in this room (across processes if message_queue used)
            try:
                socketio.emit('candle', row, room=f"sym:{symbol}")
            except Exception as e:
                print("emit error:", e)

            idx += 1
            eventlet.sleep(speed_ms / 1000.0)

        # cleanup when finished or stopped
        symbol_tasks.pop(symbol, None)

    task = socketio.start_background_task(play)
    symbol_tasks[symbol]['task'] = task


def stop_symbol_playback(symbol):
    t = symbol_tasks.get(symbol)
    if not t:
        return
    print(f"Stopping playback for symbol {symbol}")
    t['control']['running'] = False

import logging
log = logging.getLogger('werkzeug')
log.setLevel(logging.ERROR)

if __name__ == '__main__':
   print("🚀 TimescaleDB + SocketIO Server on http://0.0.0.0:5001")
   socketio.run(app, host='0.0.0.0', port=5001, debug=True)
