from flask import Blueprint, render_template, request, redirect, url_for, session, flash, jsonify
from src.models.user import User
from src.models.database import db
from datetime import datetime

technicians_bp = Blueprint('technicians', __name__)

@technicians_bp.route('/')
def list():
    if 'user_id' not in session:
        return redirect(url_for('auth.login'))
    
    current_user = User.query.get(session['user_id'])
    if not current_user.has_permission('view_all'):
        flash('Acesso negado.', 'error')
        return redirect(url_for('dashboard.main'))
    
    # Buscar técnicos com paginação
    page = request.args.get('page', 1, type=int)
    search = request.args.get('search', '')
    
    try:
        if search:
            result = db.session.execute("""
                SELECT id, name, whatsapp_number, status, last_location, last_active
                FROM technicians 
                WHERE name LIKE %s OR whatsapp_number LIKE %s
                ORDER BY name
                LIMIT %s OFFSET %s
            """, (f'%{search}%', f'%{search}%', 20, (page-1)*20))
        else:
            result = db.session.execute("""
                SELECT id, name, whatsapp_number, status, last_location, last_active
                FROM technicians 
                ORDER BY name
                LIMIT %s OFFSET %s
            """, (20, (page-1)*20))
        
        technicians = result.fetchall()
        
        # Contar total para paginação
        if search:
            count_result = db.session.execute("""
                SELECT COUNT(*) FROM technicians 
                WHERE name LIKE %s OR whatsapp_number LIKE %s
            """, (f'%{search}%', f'%{search}%'))
        else:
            count_result = db.session.execute("SELECT COUNT(*) FROM technicians")
        
        total = count_result.fetchone()[0]
        
    except Exception as e:
        print(f"Erro ao buscar técnicos: {e}")
        technicians = []
        total = 0
    
    return render_template('technicians/list.html', 
                          technicians=technicians, 
                          page=page, 
                          total=total, 
                          search=search)

@technicians_bp.route('/<int:technician_id>')
def detail(technician_id):
    if 'user_id' not in session:
        return redirect(url_for('auth.login'))
    
    current_user = User.query.get(session['user_id'])
    if not current_user.has_permission('view_all'):
        flash('Acesso negado.', 'error')
        return redirect(url_for('dashboard.main'))
    
    try:
        # Buscar dados do técnico
        result = db.session.execute("""
            SELECT id, name, whatsapp_number, status, last_location, last_active
            FROM technicians 
            WHERE id = %s
        """, (technician_id,))
        
        technician = result.fetchone()
        if not technician:
            flash('Técnico não encontrado.', 'error')
            return redirect(url_for('technicians.list'))
        
        # Buscar ordens de serviço do técnico
        orders_result = db.session.execute("""
            SELECT so.id, so.status, so.created_at, so.completed_at, c.name as client_name
            FROM service_orders so
            JOIN clients c ON so.client_id = c.id
            WHERE so.technician_id = %s
            ORDER BY so.created_at DESC
            LIMIT 10
        """, (technician_id,))
        orders = orders_result.fetchall()
        
        # Estatísticas do técnico
        stats_result = db.session.execute("""
            SELECT 
                COUNT(*) as total_orders,
                SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed_orders,
                AVG(CASE WHEN status = 'completed' AND created_at IS NOT NULL AND completed_at IS NOT NULL 
                    THEN TIMESTAMPDIFF(MINUTE, created_at, completed_at) 
                    ELSE NULL END) as avg_completion_time
            FROM service_orders
            WHERE technician_id = %s
        """, (technician_id,))
        stats = stats_result.fetchone()
        
    except Exception as e:
        print(f"Erro ao buscar detalhes do técnico: {e}")
        flash('Erro ao carregar dados do técnico.', 'error')
        return redirect(url_for('technicians.list'))
    
    return render_template('technicians/detail.html', 
                          technician=technician,
                          orders=orders,
                          stats=stats)

@technicians_bp.route('/new', methods=['GET', 'POST'])
def new():
    if 'user_id' not in session:
        return redirect(url_for('auth.login'))
    
    current_user = User.query.get(session['user_id'])
    if not current_user.has_permission('edit_all'):
        flash('Acesso negado.', 'error')
        return redirect(url_for('dashboard.main'))
    
    if request.method == 'POST':
        try:
            name = request.form['name']
            whatsapp_number = request.form['whatsapp_number']
            
            # Verificar se técnico já existe
            exists_result = db.session.execute("""
                SELECT id FROM technicians WHERE whatsapp_number = %s
            """, (whatsapp_number,))
            
            if exists_result.fetchone():
                flash('Técnico com este número de WhatsApp já existe.', 'error')
                return render_template('technicians/new.html')
            
            # Inserir técnico
            db.session.execute("""
                INSERT INTO technicians (name, whatsapp_number, status, created_at)
                VALUES (%s, %s, 'offline', NOW())
            """, (name, whatsapp_number))
            
            db.session.commit()
            flash('Técnico cadastrado com sucesso!', 'success')
            return redirect(url_for('technicians.list'))
            
        except Exception as e:
            print(f"Erro ao cadastrar técnico: {e}")
            flash('Erro ao cadastrar técnico.', 'error')
    
    return render_template('technicians/new.html')

@technicians_bp.route('/<int:technician_id>/edit', methods=['GET', 'POST'])
def edit(technician_id):
    if 'user_id' not in session:
        return redirect(url_for('auth.login'))
    
    current_user = User.query.get(session['user_id'])
    if not current_user.has_permission('edit_all'):
        flash('Acesso negado.', 'error')
        return redirect(url_for('dashboard.main'))
    
    if request.method == 'POST':
        try:
            name = request.form['name']
            status = request.form['status']
            
            db.session.execute("""
                UPDATE technicians 
                SET name = %s, status = %s
                WHERE id = %s
            """, (name, status, technician_id))
            
            db.session.commit()
            flash('Técnico atualizado com sucesso!', 'success')
            return redirect(url_for('technicians.detail', technician_id=technician_id))
            
        except Exception as e:
            print(f"Erro ao atualizar técnico: {e}")
            flash('Erro ao atualizar técnico.', 'error')
    
    # Buscar dados do técnico para edição
    try:
        result = db.session.execute("""
            SELECT id, name, whatsapp_number, status
            FROM technicians 
            WHERE id = %s
        """, (technician_id,))
        
        technician = result.fetchone()
        if not technician:
            flash('Técnico não encontrado.', 'error')
            return redirect(url_for('technicians.list'))
            
    except Exception as e:
        print(f"Erro ao buscar técnico: {e}")
        flash('Erro ao carregar dados do técnico.', 'error')
        return redirect(url_for('technicians.list'))
    
    return render_template('technicians/edit.html', technician=technician)

@technicians_bp.route('/performance')
def performance():
    if 'user_id' not in session:
        return redirect(url_for('auth.login'))
    
    current_user = User.query.get(session['user_id'])
    if not current_user.has_permission('view_reports'):
        flash('Acesso negado.', 'error')
        return redirect(url_for('dashboard.main'))
    
    # Período do relatório
    period = request.args.get('period', 'month')
    
    # Definir datas com base no período
    today = datetime.now().date()
    if period == 'month':
        start_date = datetime(today.year, today.month, 1).date()
    elif period == 'year':
        start_date = datetime(today.year, 1, 1).date()
    else:  # week
        # Início da semana (segunda-feira)
        start_date = today - timedelta(days=today.weekday())
    
    try:
        # Performance dos técnicos no período
        performance_result = db.session.execute("""
            SELECT 
                t.id, t.name, 
                COUNT(so.id) as total_orders,
                SUM(CASE WHEN so.status = 'completed' THEN 1 ELSE 0 END) as completed_orders,
                AVG(CASE WHEN so.status = 'completed' AND so.created_at IS NOT NULL AND so.completed_at IS NOT NULL 
                    THEN TIMESTAMPDIFF(MINUTE, so.created_at, so.completed_at) 
                    ELSE NULL END) as avg_completion_time
            FROM technicians t
            LEFT JOIN service_orders so ON t.id = so.technician_id AND so.created_at >= %s
            GROUP BY t.id, t.name
            ORDER BY completed_orders DESC
        """, (start_date,))
        
        performance = performance_result.fetchall()
        
    except Exception as e:
        print(f"Erro ao gerar relatório de performance: {e}")
        performance = []
    
    return render_template('technicians/performance.html',
                          period=period,
                          start_date=start_date,
                          performance=performance)
