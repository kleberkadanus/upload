from flask_sqlalchemy import SQLAlchemy
from datetime import datetime
from src.models.database import db

class User(db.Model):
    __tablename__ = 'dashboard_users'
    
    id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String(80), unique=True, nullable=False)
    email = db.Column(db.String(120), unique=True, nullable=False)
    password_hash = db.Column(db.String(255), nullable=False)
    role = db.Column(db.Enum('admin', 'attendant', 'technician'), nullable=False, default='attendant')
    full_name = db.Column(db.String(100), nullable=False)
    is_active = db.Column(db.Boolean, default=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    last_login = db.Column(db.DateTime)
    
    def __repr__(self):
        return f'<User {self.username}>'
    
    def has_permission(self, permission):
        """Verifica se o usuário tem uma permissão específica"""
        permissions = {
            'admin': ['view_all', 'edit_all', 'delete_all', 'manage_users', 'view_reports'],
            'attendant': ['view_clients', 'edit_clients', 'view_orders', 'edit_orders', 'view_financial'],
            'technician': ['view_orders', 'edit_own_orders', 'view_routes']
        }
        return permission in permissions.get(self.role, [])
    
    def get_role_display(self):
        """Retorna o nome do papel em português"""
        roles = {
            'admin': 'Administrador',
            'attendant': 'Atendente',
            'technician': 'Técnico'
        }
        return roles.get(self.role, self.role)
