import eventlet
eventlet.monkey_patch()

from flask import Flask, jsonify, request
from flask_cors import CORS
from flask_socketio import SocketIO, emit, disconnect
import psycopg2
import datetime
from datetime import timezone, timedelta
import jwt

# ---------------------------
# CONFIG - change these for production
# ---------------------------
APP_SECRET = "admin"
JWT_ALGORITHM = "HS256"
DB_CONFIG = {
    'host': 'localhost',
    'port': 5432,
    'database': 'postgres',
    'user': 'postgres',
    'password': 'admin'
}
# Simple demo user store (replace with real auth)
USERS = {
    "admin": "admin"
}
# ---------------------------

app = Flask(__name__)
app.config['SECRET_KEY'] = APP_SECRET
CORS(app, resources={r"/*": {"origins": "*"}})

# SocketIO using eventlet
socketio = SocketIO(
    app,
    cors_allowed_origins="*",
    async_mode='eventlet',          # explicit
    logger=False,
    engineio_logger=False
)

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
            s.value
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
        for ts, sym, o, h, l, c, v, algo, value in rows:
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
                # convert bs to int, others to float when possible
                if algo.lower() == 'bs':
                    candle_map[key]['bs'] = int(value) if value is not None else None
                else:
                    try:
                        candle_map[key][algo] = float(value) if value is not None else None
                    except Exception:
                        candle_map[key][algo] = value

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
    # simple check - replace with DB or proper user store in prod
    if USERS.get(username) == password:
        payload = {
            'user': username,
            'exp': datetime.datetime.now(datetime.UTC) + datetime.timedelta(hours=8)

        }
        token = jwt.encode(payload, APP_SECRET, algorithm=JWT_ALGORITHM)
        # PyJWT returns bytes in some versions
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
client_sessions = {}  # sid -> { user, token, symbol, index, candles, running }

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
    client_sessions[sid] = {'running': False}
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


@socketio.on('start_stream')
def on_start_stream(payload):
    """
    payload: { token, symbol, speed }
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
    symbol = (payload or {}).get('symbol') or 'AAPL'
    speed = int((payload or {}).get('speed') or 1000)
    # load candles for this symbol
    candles = fetch_all_candles_for_symbol(symbol)
    sess.update({
        'symbol': symbol,
        'candles': candles,
        'index': 0,
        'running': True,
        'speed': speed
    })
    # start background task
    socketio.start_background_task(stream_thread, sid)
    emit('started', {'msg': 'stream started', 'symbol': symbol})
    print(f"[{sid}] stream started for {symbol}")


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
        sess['running'] = False
        client_sessions.pop(sid, None)



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



import logging
log = logging.getLogger('werkzeug')
log.setLevel(logging.ERROR)

if __name__ == '__main__':
   print("🚀 TimescaleDB + SocketIO Server on http://0.0.0.0:5001")
   socketio.run(app, host='0.0.0.0', port=5001, debug=True)
