from flask import Blueprint, render_template, request, redirect, url_for, session, flash, jsonify
from src.models.user import User
from src.models.database import db
from datetime import datetime, timedelta

service_orders_bp = Blueprint('service_orders', __name__)

@service_orders_bp.route('/')
def list():
    if 'user_id' not in session:
        return redirect(url_for('auth.login'))
    
    current_user = User.query.get(session['user_id'])
    if not current_user.has_permission('view_orders'):
        flash('Acesso negado.', 'error')
        return redirect(url_for('dashboard.main'))
    
    # Filtros
    status = request.args.get('status', 'all')
    page = request.args.get('page', 1, type=int)
    search = request.args.get('search', '')
    
    try:
        # Construir query base
        query = """
            SELECT so.id, so.status, so.created_at, so.completed_at, 
                   c.name as client_name, c.address as client_address,
                   t.name as technician_name
            FROM service_orders so
            JOIN clients c ON so.client_id = c.id
            LEFT JOIN technicians t ON so.technician_id = t.id
        """
        
        # Adicionar filtros
        where_clauses = []
        params = []
        
        if status != 'all':
            where_clauses.append("so.status = %s")
            params.append(status)
        
        # Se for técnico, mostrar apenas suas ordens
        if current_user.role == 'technician':
            technician_result = db.session.execute("""
                SELECT id FROM technicians WHERE whatsapp_number = %s
            """, (current_user.username,))
            technician = technician_result.fetchone()
            
            if technician:
                where_clauses.append("so.technician_id = %s")
                params.append(technician[0])
        
        if search:
            where_clauses.append("(c.name LIKE %s OR c.address LIKE %s OR t.name LIKE %s)")
            params.extend([f'%{search}%', f'%{search}%', f'%{search}%'])
        
        if where_clauses:
            query += " WHERE " + " AND ".join(where_clauses)
        
        # Adicionar ordenação e paginação
        query += " ORDER BY so.created_at DESC LIMIT %s OFFSET %s"
        params.extend([20, (page-1)*20])
        
        # Executar query
        result = db.session.execute(query, params)
        orders = result.fetchall()
        
        # Contar total para paginação
        count_query = """
            SELECT COUNT(*) 
            FROM service_orders so
            JOIN clients c ON so.client_id = c.id
            LEFT JOIN technicians t ON so.technician_id = t.id
        """
        
        if where_clauses:
            count_query += " WHERE " + " AND ".join(where_clauses)
        
        count_result = db.session.execute(count_query, params[:-2] if params else [])
        total = count_result.fetchone()[0]
        
    except Exception as e:
        print(f"Erro ao buscar ordens de serviço: {e}")
        orders = []
        total = 0
    
    return render_template('service_orders/list.html',
                          orders=orders,
                          status=status,
                          page=page,
                          total=total,
                          search=search)

@service_orders_bp.route('/<int:order_id>')
def detail(order_id):
    if 'user_id' not in session:
        return redirect(url_for('auth.login'))
    
    current_user = User.query.get(session['user_id'])
    if not current_user.has_permission('view_orders'):
        flash('Acesso negado.', 'error')
        return redirect(url_for('dashboard.main'))
    
    try:
        # Buscar dados da ordem de serviço
        result = db.session.execute("""
            SELECT so.id, so.status, so.created_at, so.completed_at, so.notes,
                   c.id as client_id, c.name as client_name, c.whatsapp_number as client_whatsapp,
                   c.address as client_address,
                   t.id as technician_id, t.name as technician_name, 
                   t.whatsapp_number as technician_whatsapp,
                   t.last_location as technician_location
            FROM service_orders so
            JOIN clients c ON so.client_id = c.id
            LEFT JOIN technicians t ON so.technician_id = t.id
            WHERE so.id = %s
        """, (order_id,))
        
        order = result.fetchone()
        if not order:
            flash('Ordem de serviço não encontrada.', 'error')
            return redirect(url_for('service_orders.list'))
        
        # Verificar permissão para técnico
        if current_user.role == 'technician':
            technician_result = db.session.execute("""
                SELECT id FROM technicians WHERE whatsapp_number = %s
            """, (current_user.username,))
            technician = technician_result.fetchone()
            
            if technician and technician[0] != order.technician_id:
                flash('Acesso negado. Esta ordem não está atribuída a você.', 'error')
                return redirect(url_for('service_orders.list'))
        
        # Buscar fotos da ordem de serviço
        photos_result = db.session.execute("""
            SELECT id, type, photo_url, created_at
            FROM service_photos
            WHERE service_order_id = %s
            ORDER BY created_at
        """, (order_id,))
        photos = photos_result.fetchall()
        
        # Agrupar fotos por tipo
        photos_by_type = {}
        for photo in photos:
            if photo.type not in photos_by_type:
                photos_by_type[photo.type] = []
            photos_by_type[photo.type].append(photo)
        
    except Exception as e:
        print(f"Erro ao buscar detalhes da ordem de serviço: {e}")
        flash('Erro ao carregar dados da ordem de serviço.', 'error')
        return redirect(url_for('service_orders.list'))
    
    return render_template('service_orders/detail.html', 
                          order=order,
                          photos_by_type=photos_by_type)

@service_orders_bp.route('/new', methods=['GET', 'POST'])
def new():
    if 'user_id' not in session:
        return redirect(url_for('auth.login'))
    
    current_user = User.query.get(session['user_id'])
    if not current_user.has_permission('edit_orders'):
        flash('Acesso negado.', 'error')
        return redirect(url_for('dashboard.main'))
    
    if request.method == 'POST':
        try:
            client_id = request.form['client_id']
            technician_id = request.form.get('technician_id')  # Opcional
            notes = request.form.get('notes', '')
            
            # Validar cliente
            client_result = db.session.execute("""
                SELECT id FROM clients WHERE id = %s
            """, (client_id,))
            
            if not client_result.fetchone():
                flash('Cliente não encontrado.', 'error')
                return redirect(url_for('service_orders.new'))
            
            # Validar técnico se fornecido
            if technician_id:
                technician_result = db.session.execute("""
                    SELECT id FROM technicians WHERE id = %s
                """, (technician_id,))
                
                if not technician_result.fetchone():
                    flash('Técnico não encontrado.', 'error')
                    return redirect(url_for('service_orders.new'))
            
            # Inserir ordem de serviço
            if technician_id:
                db.session.execute("""
                    INSERT INTO service_orders 
                    (client_id, technician_id, status, notes, created_at)
                    VALUES (%s, %s, 'assigned', %s, NOW())
                """, (client_id, technician_id, notes))
            else:
                db.session.execute("""
                    INSERT INTO service_orders 
                    (client_id, status, notes, created_at)
                    VALUES (%s, 'pending', %s, NOW())
                """, (client_id, notes))
            
            db.session.commit()
            flash('Ordem de serviço criada com sucesso!', 'success')
            return redirect(url_for('service_orders.list'))
            
        except Exception as e:
            print(f"Erro ao criar ordem de serviço: {e}")
            flash('Erro ao criar ordem de serviço.', 'error')
    
    # Buscar clientes e técnicos para o formulário
    try:
        clients_result = db.session.execute("""
            SELECT id, name, whatsapp_number, address FROM clients ORDER BY name
        """)
        clients = clients_result.fetchall()
        
        technicians_result = db.session.execute("""
            SELECT id, name, status FROM technicians 
            WHERE status = 'available' OR status = 'busy'
            ORDER BY name
        """)
        technicians = technicians_result.fetchall()
    except Exception as e:
        print(f"Erro ao buscar dados para formulário: {e}")
        clients = []
        technicians = []
    
    return render_template('service_orders/new.html', 
                          clients=clients,
                          technicians=technicians)

@service_orders_bp.route('/<int:order_id>/update', methods=['POST'])
def update(order_id):
    if 'user_id' not in session:
        return redirect(url_for('auth.login'))
    
    current_user = User.query.get(session['user_id'])
    
    # Verificar permissão
    if current_user.role == 'technician':
        technician_result = db.session.execute("""
            SELECT t.id 
            FROM technicians t
            JOIN service_orders so ON t.id = so.technician_id
            WHERE t.whatsapp_number = %s AND so.id = %s
        """, (current_user.username, order_id))
        
        if not technician_result.fetchone():
            flash('Acesso negado. Esta ordem não está atribuída a você.', 'error')
            return redirect(url_for('service_orders.list'))
    elif not current_user.has_permission('edit_orders'):
        flash('Acesso negado.', 'error')
        return redirect(url_for('dashboard.main'))
    
    if request.method == 'POST':
        try:
            status = request.form.get('status')
            notes = request.form.get('notes')
            technician_id = request.form.get('technician_id')
            
            # Construir query de atualização
            update_fields = []
            params = []
            
            if status:
                update_fields.append("status = %s")
                params.append(status)
                
                # Se status for 'completed', atualizar data de conclusão
                if status == 'completed':
                    update_fields.append("completed_at = NOW()")
            
            if notes:
                update_fields.append("notes = %s")
                params.append(notes)
            
            if technician_id and current_user.has_permission('edit_all'):
                update_fields.append("technician_id = %s")
                params.append(technician_id)
            
            if update_fields:
                query = f"UPDATE service_orders SET {', '.join(update_fields)} WHERE id = %s"
                params.append(order_id)
                
                db.session.execute(query, params)
                db.session.commit()
                
                flash('Ordem de serviço atualizada com sucesso!', 'success')
            
        except Exception as e:
            print(f"Erro ao atualizar ordem de serviço: {e}")
            flash('Erro ao atualizar ordem de serviço.', 'error')
    
    return redirect(url_for('service_orders.detail', order_id=order_id))

@service_orders_bp.route('/map')
def map_view():
    if 'user_id' not in session:
        return redirect(url_for('auth.login'))
    
    current_user = User.query.get(session['user_id'])
    if not current_user.has_permission('view_all'):
        flash('Acesso negado.', 'error')
        return redirect(url_for('dashboard.main'))
    
    try:
        # Buscar técnicos ativos com localização
        technicians_result = db.session.execute("""
            SELECT id, name, status, last_location, last_active
            FROM technicians 
            WHERE status != 'offline' AND last_location IS NOT NULL
            ORDER BY name
        """)
        technicians = technicians_result.fetchall()
        
        # Buscar ordens de serviço ativas
        orders_result = db.session.execute("""
            SELECT so.id, so.status, c.address, t.name as technician_name
            FROM service_orders so
            JOIN clients c ON so.client_id = c.id
            LEFT JOIN technicians t ON so.technician_id = t.id
            WHERE so.status IN ('assigned', 'en_route', 'arrived')
            ORDER BY so.created_at
        """)
        orders = orders_result.fetchall()
        
    except Exception as e:
        print(f"Erro ao buscar dados para mapa: {e}")
        technicians = []
        orders = []
    
    return render_template('service_orders/map.html',
                          technicians=technicians,
                          orders=orders)
