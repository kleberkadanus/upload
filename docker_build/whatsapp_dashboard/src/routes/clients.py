from flask import Blueprint, render_template, request, redirect, url_for, session, flash, jsonify
from src.models.user import User
from src.models.database import db
from datetime import datetime

clients_bp = Blueprint('clients', __name__)

@clients_bp.route('/')
def list():
    if 'user_id' not in session:
        return redirect(url_for('auth.login'))
    
    current_user = User.query.get(session['user_id'])
    if not current_user.has_permission('view_clients'):
        flash('Acesso negado.', 'error')
        return redirect(url_for('dashboard.main'))
    
    # Buscar clientes com paginação
    page = request.args.get('page', 1, type=int)
    search = request.args.get('search', '')
    
    try:
        if search:
            result = db.session.execute("""
                SELECT id, name, whatsapp_number, address, last_interaction_type, 
                       last_interaction_at, created_at
                FROM clients 
                WHERE name LIKE %s OR whatsapp_number LIKE %s
                ORDER BY last_interaction_at DESC
                LIMIT %s OFFSET %s
            """, (f'%{search}%', f'%{search}%', 20, (page-1)*20))
        else:
            result = db.session.execute("""
                SELECT id, name, whatsapp_number, address, last_interaction_type, 
                       last_interaction_at, created_at
                FROM clients 
                ORDER BY last_interaction_at DESC
                LIMIT %s OFFSET %s
            """, (20, (page-1)*20))
        
        clients = result.fetchall()
        
        # Contar total para paginação
        if search:
            count_result = db.session.execute("""
                SELECT COUNT(*) FROM clients 
                WHERE name LIKE %s OR whatsapp_number LIKE %s
            """, (f'%{search}%', f'%{search}%'))
        else:
            count_result = db.session.execute("SELECT COUNT(*) FROM clients")
        
        total = count_result.fetchone()[0]
        
    except Exception as e:
        print(f"Erro ao buscar clientes: {e}")
        clients = []
        total = 0
    
    return render_template('clients/list.html', 
                          clients=clients, 
                          page=page, 
                          total=total, 
                          search=search)

@clients_bp.route('/<int:client_id>')
def detail(client_id):
    if 'user_id' not in session:
        return redirect(url_for('auth.login'))
    
    current_user = User.query.get(session['user_id'])
    if not current_user.has_permission('view_clients'):
        flash('Acesso negado.', 'error')
        return redirect(url_for('dashboard.main'))
    
    try:
        # Buscar dados do cliente
        result = db.session.execute("""
            SELECT id, name, whatsapp_number, address, last_interaction_type, 
                   last_interaction_at, created_at
            FROM clients 
            WHERE id = %s
        """, (client_id,))
        
        client = result.fetchone()
        if not client:
            flash('Cliente não encontrado.', 'error')
            return redirect(url_for('clients.list'))
        
        # Buscar agendamentos do cliente
        appointments_result = db.session.execute("""
            SELECT id, specialty, appointment_date, status, created_at
            FROM appointments 
            WHERE client_id = %s
            ORDER BY appointment_date DESC
            LIMIT 10
        """, (client_id,))
        appointments = appointments_result.fetchall()
        
        # Buscar ordens de serviço do cliente
        orders_result = db.session.execute("""
            SELECT id, status, created_at, completed_at
            FROM service_orders 
            WHERE client_id = %s
            ORDER BY created_at DESC
            LIMIT 10
        """, (client_id,))
        orders = orders_result.fetchall()
        
        # Buscar faturas do cliente
        invoices_result = db.session.execute("""
            SELECT id, amount, due_date, status, description
            FROM invoices 
            WHERE client_id = %s
            ORDER BY due_date DESC
            LIMIT 10
        """, (client_id,))
        invoices = invoices_result.fetchall()
        
    except Exception as e:
        print(f"Erro ao buscar detalhes do cliente: {e}")
        flash('Erro ao carregar dados do cliente.', 'error')
        return redirect(url_for('clients.list'))
    
    return render_template('clients/detail.html', 
                          client=client,
                          appointments=appointments,
                          orders=orders,
                          invoices=invoices)

@clients_bp.route('/<int:client_id>/edit', methods=['GET', 'POST'])
def edit(client_id):
    if 'user_id' not in session:
        return redirect(url_for('auth.login'))
    
    current_user = User.query.get(session['user_id'])
    if not current_user.has_permission('edit_clients'):
        flash('Acesso negado.', 'error')
        return redirect(url_for('dashboard.main'))
    
    if request.method == 'POST':
        try:
            name = request.form['name']
            address = request.form['address']
            
            db.session.execute("""
                UPDATE clients 
                SET name = %s, address = %s
                WHERE id = %s
            """, (name, address, client_id))
            
            db.session.commit()
            flash('Cliente atualizado com sucesso!', 'success')
            return redirect(url_for('clients.detail', client_id=client_id))
            
        except Exception as e:
            print(f"Erro ao atualizar cliente: {e}")
            flash('Erro ao atualizar cliente.', 'error')
    
    # Buscar dados do cliente para edição
    try:
        result = db.session.execute("""
            SELECT id, name, whatsapp_number, address
            FROM clients 
            WHERE id = %s
        """, (client_id,))
        
        client = result.fetchone()
        if not client:
            flash('Cliente não encontrado.', 'error')
            return redirect(url_for('clients.list'))
            
    except Exception as e:
        print(f"Erro ao buscar cliente: {e}")
        flash('Erro ao carregar dados do cliente.', 'error')
        return redirect(url_for('clients.list'))
    
    return render_template('clients/edit.html', client=client)
