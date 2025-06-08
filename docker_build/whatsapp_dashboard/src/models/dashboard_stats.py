from flask_sqlalchemy import SQLAlchemy
from datetime import datetime
from sqlalchemy import Numeric
from src.models.database import db

class DashboardStats(db.Model):
    __tablename__ = 'dashboard_stats'
    
    id = db.Column(db.Integer, primary_key=True)
    stat_date = db.Column(db.Date, nullable=False, default=datetime.utcnow().date())
    total_clients = db.Column(db.Integer, default=0)
    total_appointments = db.Column(db.Integer, default=0)
    total_service_orders = db.Column(db.Integer, default=0)
    pending_orders = db.Column(db.Integer, default=0)
    completed_orders = db.Column(db.Integer, default=0)
    total_revenue = db.Column(Numeric(10, 2), default=0.00)
    pending_invoices = db.Column(db.Integer, default=0)
    active_technicians = db.Column(db.Integer, default=0)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    
    @staticmethod
    def get_current_stats():
        """Calcula estatísticas atuais do sistema"""
        from datetime import date
        
        # Buscar dados das tabelas existentes do bot WhatsApp
        stats = {}
        
        try:
            # Total de clientes
            result = db.session.execute("SELECT COUNT(*) as count FROM clients")
            stats['total_clients'] = result.fetchone()[0]
            
            # Total de agendamentos
            result = db.session.execute("SELECT COUNT(*) as count FROM appointments")
            stats['total_appointments'] = result.fetchone()[0]
            
            # Ordens de serviço
            result = db.session.execute("SELECT COUNT(*) as count FROM service_orders")
            stats['total_service_orders'] = result.fetchone()[0]
            
            # Ordens pendentes
            result = db.session.execute("SELECT COUNT(*) as count FROM service_orders WHERE status IN ('assigned', 'en_route', 'arrived')")
            stats['pending_orders'] = result.fetchone()[0]
            
            # Ordens concluídas
            result = db.session.execute("SELECT COUNT(*) as count FROM service_orders WHERE status = 'completed'")
            stats['completed_orders'] = result.fetchone()[0]
            
            # Faturas pendentes
            result = db.session.execute("SELECT COUNT(*) as count FROM invoices WHERE status = 'open'")
            stats['pending_invoices'] = result.fetchone()[0]
            
            # Técnicos ativos
            result = db.session.execute("SELECT COUNT(*) as count FROM technicians WHERE status = 'available'")
            stats['active_technicians'] = result.fetchone()[0]
            
            # Receita total (faturas pagas)
            result = db.session.execute("SELECT COALESCE(SUM(amount), 0) as total FROM invoices WHERE status = 'paid'")
            stats['total_revenue'] = float(result.fetchone()[0])
            
        except Exception as e:
            print(f"Erro ao calcular estatísticas: {e}")
            # Valores padrão em caso de erro
            stats = {
                'total_clients': 0,
                'total_appointments': 0,
                'total_service_orders': 0,
                'pending_orders': 0,
                'completed_orders': 0,
                'pending_invoices': 0,
                'active_technicians': 0,
                'total_revenue': 0.00
            }
        
        return stats
