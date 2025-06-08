import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

from flask import Flask, render_template, redirect, url_for

app = Flask(__name__)
app.secret_key = 'whatsapp_dashboard_secret_key_2025'

@app.route('/')
def index():
    return render_template('auth/login.html')

@app.route('/health')
def health():
    return {"status": "ok", "message": "Dashboard is running"}

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000, debug=True)
