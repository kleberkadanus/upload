from flask import Blueprint, render_template, request, redirect, url_for, session, flash
from werkzeug.security import check_password_hash, generate_password_hash
from src.models.user import User
from src.models.database import db
from datetime import datetime

auth_bp = Blueprint('auth', __name__)

@auth_bp.route('/login', methods=['GET', 'POST'])
def login():
    if request.method == 'POST':
        username = request.form['username']
        password = request.form['password']
        
        user = User.query.filter_by(username=username).first()
        
        if user and check_password_hash(user.password_hash, password):
            if user.is_active:
                session['user_id'] = user.id
                session['username'] = user.username
                session['role'] = user.role
                
                # Atualizar último login
                user.last_login = datetime.utcnow()
                db.session.commit()
                
                flash('Login realizado com sucesso!', 'success')
                return redirect(url_for('dashboard.main'))
            else:
                flash('Usuário inativo. Contate o administrador.', 'error')
        else:
            flash('Usuário ou senha incorretos.', 'error')
    
    return render_template('auth/login.html')

@auth_bp.route('/logout')
def logout():
    session.clear()
    flash('Logout realizado com sucesso!', 'success')
    return redirect(url_for('auth.login'))

@auth_bp.route('/users')
def users():
    if 'user_id' not in session:
        return redirect(url_for('auth.login'))
    
    current_user = User.query.get(session['user_id'])
    if not current_user.has_permission('manage_users'):
        flash('Acesso negado.', 'error')
        return redirect(url_for('dashboard.main'))
    
    users = User.query.all()
    return render_template('auth/users.html', users=users)

@auth_bp.route('/users/new', methods=['GET', 'POST'])
def new_user():
    if 'user_id' not in session:
        return redirect(url_for('auth.login'))
    
    current_user = User.query.get(session['user_id'])
    if not current_user.has_permission('manage_users'):
        flash('Acesso negado.', 'error')
        return redirect(url_for('dashboard.main'))
    
    if request.method == 'POST':
        username = request.form['username']
        email = request.form['email']
        password = request.form['password']
        role = request.form['role']
        full_name = request.form['full_name']
        
        # Verificar se usuário já existe
        if User.query.filter_by(username=username).first():
            flash('Nome de usuário já existe.', 'error')
            return render_template('auth/new_user.html')
        
        if User.query.filter_by(email=email).first():
            flash('Email já está em uso.', 'error')
            return render_template('auth/new_user.html')
        
        new_user = User(
            username=username,
            email=email,
            password_hash=generate_password_hash(password),
            role=role,
            full_name=full_name,
            is_active=True
        )
        
        db.session.add(new_user)
        db.session.commit()
        
        flash('Usuário criado com sucesso!', 'success')
        return redirect(url_for('auth.users'))
    
    return render_template('auth/new_user.html')

@auth_bp.route('/users/<int:user_id>/toggle')
def toggle_user(user_id):
    if 'user_id' not in session:
        return redirect(url_for('auth.login'))
    
    current_user = User.query.get(session['user_id'])
    if not current_user.has_permission('manage_users'):
        flash('Acesso negado.', 'error')
        return redirect(url_for('dashboard.main'))
    
    user = User.query.get_or_404(user_id)
    user.is_active = not user.is_active
    db.session.commit()
    
    status = 'ativado' if user.is_active else 'desativado'
    flash(f'Usuário {user.username} {status} com sucesso!', 'success')
    
    return redirect(url_for('auth.users'))
