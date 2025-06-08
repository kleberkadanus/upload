from flask import Blueprint, render_template, request, redirect, url_for, session, flash, jsonify
from src.models.dashboard_stats import DashboardStats
from src.models.user import User
from src.models.database import db
from datetime import datetime, timedelta

dashboard_bp = Blueprint('dashboard', __name__)

@dashboard_bp.route('/')
def main():
    if 'user_id' not in session:
        return redirect(url_for('auth.login'))
    
    # Obter estatísticas atuais
    stats = DashboardStats.get_current_stats()
    
    # Obter dados para gráficos
    # Ordens de serviço por status
    try:
        result = db.session.execute("""
            SELECT status, COUNT(*) as count 
            FROM service_orders 
            GROUP BY status
        """)
        orders_by_status = {row[0]: row[1] for row in result}
    except:
        orders_by_status = {}
    
    # Faturamento dos últimos 6 meses
    try:
        result = db.session.execute("""
            SELECT DATE_FORMAT(due_date, '%Y-%m') as month, SUM(amount) as total 
            FROM invoices 
            WHERE status = 'paid' 
            AND due_date >= DATE_SUB(CURDATE(), INTERVAL 6 MONTH)
            GROUP BY DATE_FORMAT(due_date, '%Y-%m')
            ORDER BY month
        """)
        revenue_by_month = {row[0]: float(row[1]) for row in result}
    except:
        revenue_by_month = {}
    
    # Atendimentos por tipo
    try:
        result = db.session.execute("""
            SELECT last_interaction_type, COUNT(*) as count 
            FROM clients 
            WHERE last_interaction_type IS NOT NULL
            GROUP BY last_interaction_type
        """)
        interactions_by_type = {row[0]: row[1] for row in result}
    except:
        interactions_by_type = {}
    
    # Alertas recentes
    alerts = []
    
    # Boletos vencidos
    try:
        result = db.session.execute("""
            SELECT COUNT(*) as count 
            FROM invoices 
            WHERE status = 'open' 
            AND due_date < CURDATE()
        """)
        overdue_count = result.fetchone()[0]
        if overdue_count > 0:
            alerts.append({
                'type': 'danger',
                'message': f'{overdue_count} boletos vencidos pendentes de pagamento',
                'link': url_for('financial.invoices')
            })
    except:
        pass
    
    # Ordens urgentes
    try:
        result = db.session.execute("""
            SELECT COUNT(*) as count 
            FROM service_orders 
            WHERE status IN ('assigned', 'en_route') 
            AND created_at < DATE_SUB(NOW(), INTERVAL 24 HOUR)
        """)
        urgent_count = result.fetchone()[0]
        if urgent_count > 0:
            alerts.append({
                'type': 'warning',
                'message': f'{urgent_count} ordens de serviço urgentes pendentes',
                'link': url_for('service_orders.list')
            })
    except:
        pass
    
    return render_template('dashboard/main.html', 
                          stats=stats, 
                          orders_by_status=orders_by_status,
                          revenue_by_month=revenue_by_month,
                          interactions_by_type=interactions_by_type,
                          alerts=alerts)

@dashboard_bp.route('/profile')
def profile():
    if 'user_id' not in session:
        return redirect(url_for('auth.login'))
    
    user = User.query.get(session['user_id'])
    return render_template('dashboard/profile.html', user=user)

@dashboard_bp.route('/profile/update', methods=['POST'])
def update_profile():
    if 'user_id' not in session:
        return redirect(url_for('auth.login'))
    
    user = User.query.get(session['user_id'])
    
    if request.method == 'POST':
        user.full_name = request.form['full_name']
        user.email = request.form['email']
        
        # Atualizar senha se fornecida
        if request.form['password'] and len(request.form['password']) >= 6:
            user.password_hash = generate_password_hash(request.form['password'])
        
        db.session.commit()
        flash('Perfil atualizado com sucesso!', 'success')
    
    return redirect(url_for('dashboard.profile'))
