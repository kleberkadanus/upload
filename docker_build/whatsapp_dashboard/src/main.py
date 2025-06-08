import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))  # DON'T CHANGE THIS !!!

from flask import Flask, render_template, request, redirect, url_for, session, flash, jsonify
from werkzeug.security import generate_password_hash, check_password_hash
from datetime import datetime, timedelta
import pymysql

# Importar db do módulo database
from src.models.database import db

app = Flask(__name__)
app.secret_key = 'whatsapp_dashboard_secret_key_2025'

# Configuração do banco de dados - usando o mesmo banco do bot WhatsApp
app.config['SQLALCHEMY_DATABASE_URI'] = f"mysql+pymysql://root:+0q)3E3.G]Yu@104.234.30.102:3306/WTS2"
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False

# Inicializar o db com o app
db.init_app(app)

# Importar modelos - após inicializar db com app
from src.models.user import User
from src.models.dashboard_stats import DashboardStats

# Importar rotas
from src.routes.auth import auth_bp
from src.routes.dashboard import dashboard_bp
from src.routes.clients import clients_bp
from src.routes.financial import financial_bp
from src.routes.technicians import technicians_bp
from src.routes.service_orders import service_orders_bp

# Registrar blueprints
app.register_blueprint(auth_bp, url_prefix='/auth')
app.register_blueprint(dashboard_bp, url_prefix='/dashboard')
app.register_blueprint(clients_bp, url_prefix='/clients')
app.register_blueprint(financial_bp, url_prefix='/financial')
app.register_blueprint(technicians_bp, url_prefix='/technicians')
app.register_blueprint(service_orders_bp, url_prefix='/orders')

@app.route('/')
def index():
    if 'user_id' not in session:
        return redirect(url_for('auth.login'))
    return redirect(url_for('dashboard.main'))

@app.context_processor
def inject_user():
    if 'user_id' in session:
        user = User.query.get(session['user_id'])
        return dict(current_user=user)
    return dict(current_user=None)

if __name__ == '__main__':
    with app.app_context():
        db.create_all()
        # Criar usuário admin padrão se não existir
        admin_user = User.query.filter_by(username='admin').first()
        if not admin_user:
            admin_user = User(
                username='admin',
                email='admin@whatsapp-bot.com',
                password_hash=generate_password_hash('admin123'),
                role='admin',
                full_name='Administrador',
                is_active=True
            )
            db.session.add(admin_user)
            db.session.commit()
            print("Usuário admin criado: admin / admin123")
    
    app.run(host='0.0.0.0', port=5000, debug=True)
