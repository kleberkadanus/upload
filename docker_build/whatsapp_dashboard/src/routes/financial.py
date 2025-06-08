from flask import Blueprint, render_template, request, redirect, url_for, session, flash, jsonify
from src.models.user import User
from src.models.database import db
from datetime import datetime

financial_bp = Blueprint('financial', __name__)

@financial_bp.route('/')
def main():
    if 'user_id' not in session:
        return redirect(url_for('auth.login'))
    
    current_user = User.query.get(session['user_id'])
    if not current_user.has_permission('view_financial'):
        flash('Acesso negado.', 'error')
        return redirect(url_for('dashboard.main'))
    
    # Resumo financeiro
    try:
        # Total de faturas pendentes
        pending_result = db.session.execute("""
            SELECT COUNT(*) as count, SUM(amount) as total
            FROM invoices 
            WHERE status = 'open'
        """)
        pending = pending_result.fetchone()
        pending_count = pending[0] if pending else 0
        pending_total = float(pending[1]) if pending and pending[1] else 0
        
        # Total de faturas pagas (últimos 30 dias)
        paid_result = db.session.execute("""
            SELECT COUNT(*) as count, SUM(amount) as total
            FROM invoices 
            WHERE status = 'paid'
            AND due_date >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)
        """)
        paid = paid_result.fetchone()
        paid_count = paid[0] if paid else 0
        paid_total = float(paid[1]) if paid and paid[1] else 0
        
        # Total de faturas vencidas
        overdue_result = db.session.execute("""
            SELECT COUNT(*) as count, SUM(amount) as total
            FROM invoices 
            WHERE status = 'open'
            AND due_date < CURDATE()
        """)
        overdue = overdue_result.fetchone()
        overdue_count = overdue[0] if overdue else 0
        overdue_total = float(overdue[1]) if overdue and overdue[1] else 0
        
    except Exception as e:
        print(f"Erro ao buscar resumo financeiro: {e}")
        pending_count = pending_total = paid_count = paid_total = overdue_count = overdue_total = 0
    
    # Buscar configuração PIX
    try:
        pix_result = db.session.execute("""
            SELECT value FROM settings WHERE name = 'pix_key'
        """)
        pix_key = pix_result.fetchone()
        pix_key = pix_key[0] if pix_key else 'Não configurado'
    except:
        pix_key = 'Não configurado'
    
    return render_template('financial/main.html',
                          pending_count=pending_count,
                          pending_total=pending_total,
                          paid_count=paid_count,
                          paid_total=paid_total,
                          overdue_count=overdue_count,
                          overdue_total=overdue_total,
                          pix_key=pix_key)

@financial_bp.route('/invoices')
def invoices():
    if 'user_id' not in session:
        return redirect(url_for('auth.login'))
    
    current_user = User.query.get(session['user_id'])
    if not current_user.has_permission('view_financial'):
        flash('Acesso negado.', 'error')
        return redirect(url_for('dashboard.main'))
    
    # Filtros
    status = request.args.get('status', 'all')
    page = request.args.get('page', 1, type=int)
    search = request.args.get('search', '')
    
    try:
        # Construir query base
        query = """
            SELECT i.id, i.amount, i.due_date, i.status, i.description, 
                   c.name as client_name, c.whatsapp_number
            FROM invoices i
            JOIN clients c ON i.client_id = c.id
        """
        
        # Adicionar filtros
        where_clauses = []
        params = []
        
        if status != 'all':
            where_clauses.append("i.status = %s")
            params.append(status)
        
        if search:
            where_clauses.append("(c.name LIKE %s OR c.whatsapp_number LIKE %s OR i.description LIKE %s)")
            params.extend([f'%{search}%', f'%{search}%', f'%{search}%'])
        
        if where_clauses:
            query += " WHERE " + " AND ".join(where_clauses)
        
        # Adicionar ordenação e paginação
        query += " ORDER BY i.due_date DESC LIMIT %s OFFSET %s"
        params.extend([20, (page-1)*20])
        
        # Executar query
        result = db.session.execute(query, params)
        invoices = result.fetchall()
        
        # Contar total para paginação
        count_query = """
            SELECT COUNT(*) 
            FROM invoices i
            JOIN clients c ON i.client_id = c.id
        """
        
        if where_clauses:
            count_query += " WHERE " + " AND ".join(where_clauses)
        
        count_result = db.session.execute(count_query, params[:-2] if params else [])
        total = count_result.fetchone()[0]
        
    except Exception as e:
        print(f"Erro ao buscar faturas: {e}")
        invoices = []
        total = 0
    
    return render_template('financial/invoices.html',
                          invoices=invoices,
                          status=status,
                          page=page,
                          total=total,
                          search=search)

@financial_bp.route('/invoices/new', methods=['GET', 'POST'])
def new_invoice():
    if 'user_id' not in session:
        return redirect(url_for('auth.login'))
    
    current_user = User.query.get(session['user_id'])
    if not current_user.has_permission('edit_all'):
        flash('Acesso negado.', 'error')
        return redirect(url_for('dashboard.main'))
    
    if request.method == 'POST':
        try:
            client_id = request.form['client_id']
            amount = request.form['amount']
            due_date = request.form['due_date']
            description = request.form['description']
            
            # Validar cliente
            client_result = db.session.execute("""
                SELECT id FROM clients WHERE id = %s
            """, (client_id,))
            
            if not client_result.fetchone():
                flash('Cliente não encontrado.', 'error')
                return redirect(url_for('financial.new_invoice'))
            
            # Inserir fatura
            db.session.execute("""
                INSERT INTO invoices (client_id, amount, due_date, status, description, created_at)
                VALUES (%s, %s, %s, 'open', %s, NOW())
            """, (client_id, amount, due_date, description))
            
            db.session.commit()
            flash('Fatura criada com sucesso!', 'success')
            return redirect(url_for('financial.invoices'))
            
        except Exception as e:
            print(f"Erro ao criar fatura: {e}")
            flash('Erro ao criar fatura.', 'error')
    
    # Buscar clientes para o formulário
    try:
        clients_result = db.session.execute("""
            SELECT id, name, whatsapp_number FROM clients ORDER BY name
        """)
        clients = clients_result.fetchall()
    except:
        clients = []
    
    return render_template('financial/new_invoice.html', clients=clients)

@financial_bp.route('/pix', methods=['GET', 'POST'])
def pix_settings():
    if 'user_id' not in session:
        return redirect(url_for('auth.login'))
    
    current_user = User.query.get(session['user_id'])
    if not current_user.has_permission('edit_all'):
        flash('Acesso negado.', 'error')
        return redirect(url_for('dashboard.main'))
    
    if request.method == 'POST':
        try:
            pix_key = request.form['pix_key']
            
            # Verificar se configuração já existe
            exists_result = db.session.execute("""
                SELECT id FROM settings WHERE name = 'pix_key'
            """)
            
            if exists_result.fetchone():
                # Atualizar
                db.session.execute("""
                    UPDATE settings SET value = %s WHERE name = 'pix_key'
                """, (pix_key,))
            else:
                # Inserir
                db.session.execute("""
                    INSERT INTO settings (name, value) VALUES ('pix_key', %s)
                """, (pix_key,))
            
            db.session.commit()
            flash('Chave PIX atualizada com sucesso!', 'success')
            
        except Exception as e:
            print(f"Erro ao atualizar chave PIX: {e}")
            flash('Erro ao atualizar chave PIX.', 'error')
    
    # Buscar configuração atual
    try:
        pix_result = db.session.execute("""
            SELECT value FROM settings WHERE name = 'pix_key'
        """)
        pix_key = pix_result.fetchone()
        pix_key = pix_key[0] if pix_key else ''
    except:
        pix_key = ''
    
    return render_template('financial/pix_settings.html', pix_key=pix_key)

@financial_bp.route('/reports')
def reports():
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
        if today.month == 12:
            end_date = datetime(today.year + 1, 1, 1).date()
        else:
            end_date = datetime(today.year, today.month + 1, 1).date()
    elif period == 'year':
        start_date = datetime(today.year, 1, 1).date()
        end_date = datetime(today.year + 1, 1, 1).date()
    else:  # week
        # Início da semana (segunda-feira)
        start_date = today - timedelta(days=today.weekday())
        # Fim da semana (domingo)
        end_date = start_date + timedelta(days=7)
    
    try:
        # Faturamento no período
        revenue_result = db.session.execute("""
            SELECT SUM(amount) as total
            FROM invoices 
            WHERE status = 'paid'
            AND due_date >= %s AND due_date < %s
        """, (start_date, end_date))
        revenue = revenue_result.fetchone()
        revenue_total = float(revenue[0]) if revenue and revenue[0] else 0
        
        # Faturas por status no período
        status_result = db.session.execute("""
            SELECT status, COUNT(*) as count, SUM(amount) as total
            FROM invoices 
            WHERE due_date >= %s AND due_date < %s
            GROUP BY status
        """, (start_date, end_date))
        status_stats = {row[0]: {'count': row[1], 'total': float(row[2])} for row in status_result}
        
        # Faturamento por dia no período
        daily_result = db.session.execute("""
            SELECT DATE(due_date) as day, SUM(amount) as total
            FROM invoices 
            WHERE status = 'paid'
            AND due_date >= %s AND due_date < %s
            GROUP BY DATE(due_date)
            ORDER BY day
        """, (start_date, end_date))
        daily_revenue = {row[0].strftime('%Y-%m-%d'): float(row[1]) for row in daily_result}
        
    except Exception as e:
        print(f"Erro ao gerar relatório financeiro: {e}")
        revenue_total = 0
        status_stats = {}
        daily_revenue = {}
    
    return render_template('financial/reports.html',
                          period=period,
                          start_date=start_date,
                          end_date=end_date,
                          revenue_total=revenue_total,
                          status_stats=status_stats,
                          daily_revenue=daily_revenue)
