/**
 * Módulo de Persistência de Dados do Cliente
 * 
 * Este módulo gerencia o armazenamento persistente de dados do cliente,
 * incluindo validação, tratamento de erros e logs detalhados.
 */

const mariadb = require("mariadb");

// Configuração do pool de conexões
const pool = mariadb.createPool({
  host: "104.234.30.102",
  user: "root",
  password: "+0q)3E3.G]Yu",
  database: "WTS2",
  connectionLimit: 5,
  connectTimeout: 15000,
  acquireTimeout: 15000,
});

/**
 * Valida o número de telefone do WhatsApp
 * @param {String} number - Número de telefone a ser validado
 * @returns {Object} - Resultado da validação {valid: boolean, message: string}
 */
function validateWhatsAppNumber(number) {
  if (!number) {
    return { valid: false, message: "Número de telefone não fornecido" };
  }
  
  // Remove caracteres não numéricos
  const cleanNumber = number.replace(/\D/g, '');
  
  // Verifica se o número tem pelo menos 10 dígitos (mínimo para número de telefone)
  if (cleanNumber.length < 10) {
    return { valid: false, message: "Número de telefone muito curto" };
  }
  
  // Verifica se o número tem no máximo 15 dígitos (padrão E.164)
  if (cleanNumber.length > 15) {
    return { valid: false, message: "Número de telefone muito longo" };
  }
  
  return { valid: true, message: "Número de telefone válido" };
}

/**
 * Valida o nome do cliente
 * @param {String} name - Nome a ser validado
 * @returns {Object} - Resultado da validação {valid: boolean, message: string}
 */
function validateName(name) {
  if (!name) {
    return { valid: false, message: "Nome não fornecido" };
  }
  
  // Verifica o comprimento do nome
  if (name.length < 2) {
    return { valid: false, message: "Nome muito curto (mínimo 2 caracteres)" };
  }
  
  if (name.length > 100) {
    return { valid: false, message: "Nome muito longo (máximo 100 caracteres)" };
  }
  
  // Verifica se o nome contém caracteres inválidos
  if (/[^\p{L}\p{M}\s\-'.]/u.test(name)) {
    return { valid: false, message: "Nome contém caracteres inválidos" };
  }
  
  return { valid: true, message: "Nome válido" };
}

/**
 * Valida o endereço do cliente
 * @param {String} address - Endereço a ser validado
 * @returns {Object} - Resultado da validação {valid: boolean, message: string}
 */
function validateAddress(address) {
  if (!address) {
    return { valid: false, message: "Endereço não fornecido" };
  }
  
  // Verifica o comprimento do endereço
  if (address.length < 10) {
    return { valid: false, message: "Endereço muito curto (mínimo 10 caracteres)" };
  }
  
  if (address.length > 255) {
    return { valid: false, message: "Endereço muito longo (máximo 255 caracteres)" };
  }
  
  // Verifica se o endereço contém informações mínimas (rua e número)
  if (!(/\d/.test(address) && /[a-zA-Z]/.test(address))) {
    return { valid: false, message: "Endereço deve conter texto e números" };
  }
  
  return { valid: true, message: "Endereço válido" };
}

/**
 * Busca um cliente pelo número de WhatsApp
 * @param {String} whatsappNumber - Número de WhatsApp do cliente
 * @returns {Promise<Object|null>} - Dados do cliente ou null se não encontrado
 */
async function getClientByWhatsAppNumber(whatsappNumber) {
  let conn;
  try {
    conn = await pool.getConnection();
    console.log(`[DB] Buscando cliente com número ${whatsappNumber}`);
    
    const result = await conn.query(
      "SELECT * FROM clients WHERE whatsapp_number = ? LIMIT 1",
      [whatsappNumber]
    );
    
    if (result.length > 0) {
      console.log(`[DB] Cliente encontrado: ${result[0].name} (ID: ${result[0].id})`);
      return result[0];
    } else {
      console.log(`[DB] Cliente não encontrado para o número ${whatsappNumber}`);
      return null;
    }
  } catch (error) {
    console.error(`[ERRO DB] Falha ao buscar cliente por número ${whatsappNumber}:`, error);
    throw new Error(`Falha ao buscar cliente: ${error.message}`);
  } finally {
    if (conn) conn.release();
  }
}

/**
 * Salva ou atualiza um cliente no banco de dados
 * @param {Object} clientData - Dados do cliente {whatsappNumber, name, address}
 * @returns {Promise<Object>} - Cliente salvo/atualizado com ID
 */
async function saveClient(clientData) {
  // Validação dos dados
  const numberValidation = validateWhatsAppNumber(clientData.whatsappNumber);
  if (!numberValidation.valid) {
    throw new Error(`Número de WhatsApp inválido: ${numberValidation.message}`);
  }
  
  const nameValidation = validateName(clientData.name);
  if (!nameValidation.valid) {
    throw new Error(`Nome inválido: ${nameValidation.message}`);
  }
  
  const addressValidation = validateAddress(clientData.address);
  if (!addressValidation.valid) {
    throw new Error(`Endereço inválido: ${addressValidation.message}`);
  }
  
  let conn;
  try {
    conn = await pool.getConnection();
    
    // Iniciar transação
    await conn.beginTransaction();
    console.log(`[DB] Iniciando transação para salvar/atualizar cliente ${clientData.name}`);
    
    // Verificar se o cliente já existe
    const existingClient = await conn.query(
      "SELECT id FROM clients WHERE whatsapp_number = ? LIMIT 1",
      [clientData.whatsappNumber]
    );
    
    let result;
    if (existingClient.length > 0) {
      // Atualizar cliente existente
      console.log(`[DB] Atualizando cliente existente ID: ${existingClient[0].id}`);
      await conn.query(
        "UPDATE clients SET name = ?, address = ?, updated_at = NOW() WHERE id = ?",
        [clientData.name, clientData.address, existingClient[0].id]
      );
      result = { 
        id: existingClient[0].id, 
        whatsapp_number: clientData.whatsappNumber,
        name: clientData.name, 
        address: clientData.address,
        updated: true
      };
    } else {
      // Inserir novo cliente
      console.log(`[DB] Inserindo novo cliente: ${clientData.name}`);
      const insertResult = await conn.query(
        "INSERT INTO clients (whatsapp_number, name, address) VALUES (?, ?, ?)",
        [clientData.whatsappNumber, clientData.name, clientData.address]
      );
      result = { 
        id: insertResult.insertId, 
        whatsapp_number: clientData.whatsappNumber,
        name: clientData.name, 
        address: clientData.address,
        created: true
      };
    }
    
    // Commit da transação
    await conn.commit();
    console.log(`[DB] Transação concluída com sucesso para cliente ID: ${result.id}`);
    
    return result;
  } catch (error) {
    // Rollback em caso de erro
    if (conn) {
      try {
        await conn.rollback();
        console.log("[DB] Rollback da transação realizado devido a erro");
      } catch (rollbackError) {
        console.error("[ERRO DB] Falha ao realizar rollback:", rollbackError);
      }
    }
    
    console.error("[ERRO DB] Falha ao salvar/atualizar cliente:", error);
    throw new Error(`Falha ao salvar cliente: ${error.message}`);
  } finally {
    if (conn) conn.release();
  }
}

/**
 * Atualiza um campo específico do cliente
 * @param {Number} clientId - ID do cliente
 * @param {String} field - Campo a ser atualizado (name ou address)
 * @param {String} value - Novo valor
 * @returns {Promise<Object>} - Resultado da atualização
 */
async function updateClientField(clientId, field, value) {
  // Validação do campo e valor
  if (field !== 'name' && field !== 'address') {
    throw new Error(`Campo inválido: ${field}. Apenas 'name' e 'address' são permitidos.`);
  }
  
  let validation;
  if (field === 'name') {
    validation = validateName(value);
  } else {
    validation = validateAddress(value);
  }
  
  if (!validation.valid) {
    throw new Error(`Valor inválido para ${field}: ${validation.message}`);
  }
  
  let conn;
  try {
    conn = await pool.getConnection();
    
    // Iniciar transação
    await conn.beginTransaction();
    console.log(`[DB] Iniciando transação para atualizar ${field} do cliente ID: ${clientId}`);
    
    // Verificar se o cliente existe
    const existingClient = await conn.query(
      "SELECT id FROM clients WHERE id = ? LIMIT 1",
      [clientId]
    );
    
    if (existingClient.length === 0) {
      await conn.rollback();
      throw new Error(`Cliente com ID ${clientId} não encontrado`);
    }
    
    // Atualizar o campo
    await conn.query(
      `UPDATE clients SET ${field} = ?, updated_at = NOW() WHERE id = ?`,
      [value, clientId]
    );
    
    // Commit da transação
    await conn.commit();
    console.log(`[DB] Campo ${field} atualizado com sucesso para cliente ID: ${clientId}`);
    
    return { 
      id: clientId, 
      field, 
      value, 
      updated: true 
    };
  } catch (error) {
    // Rollback em caso de erro
    if (conn) {
      try {
        await conn.rollback();
        console.log("[DB] Rollback da transação realizado devido a erro");
      } catch (rollbackError) {
        console.error("[ERRO DB] Falha ao realizar rollback:", rollbackError);
      }
    }
    
    console.error(`[ERRO DB] Falha ao atualizar ${field} do cliente ID ${clientId}:`, error);
    throw new Error(`Falha ao atualizar cliente: ${error.message}`);
  } finally {
    if (conn) conn.release();
  }
}

/**
 * Atualiza o tipo de última interação do cliente
 * @param {Number} clientId - ID do cliente
 * @param {String} interactionType - Tipo de interação
 * @param {Object} additionalData - Dados adicionais da interação
 * @returns {Promise<Object>} - Resultado da atualização
 */
async function updateClientLastInteraction(clientId, interactionType, additionalData = {}) {
  let conn;
  try {
    conn = await pool.getConnection();
    
    console.log(`[DB] Atualizando última interação do cliente ID: ${clientId} para ${interactionType}`);
    
    // Construir query base
    let query = "UPDATE clients SET last_interaction_type = ?, last_interaction_at = NOW()";
    const params = [interactionType];
    
    // Adicionar campos específicos com base no tipo de interação
    if (interactionType === "Agendamento" && additionalData.appointmentId) {
      query += ", last_appointment_id = ?";
      params.push(additionalData.appointmentId);
    } else if (interactionType === "Suporte Atendente" && additionalData.ticketId) {
      query += ", last_ticket_id = ?";
      params.push(additionalData.ticketId);
    }
    
    // Finalizar query
    query += " WHERE id = ?";
    params.push(clientId);
    
    // Executar query
    await conn.query(query, params);
    
    console.log(`[DB] Última interação atualizada com sucesso para cliente ID: ${clientId}`);
    
    return { 
      id: clientId, 
      interactionType, 
      updated: true,
      ...additionalData
    };
  } catch (error) {
    console.error(`[ERRO DB] Falha ao atualizar última interação do cliente ID ${clientId}:`, error);
    throw new Error(`Falha ao atualizar última interação: ${error.message}`);
  } finally {
    if (conn) conn.release();
  }
}

/**
 * Verifica a saúde da conexão com o banco de dados
 * @returns {Promise<Object>} - Status da conexão
 */
async function checkDatabaseHealth() {
  let conn;
  try {
    const startTime = Date.now();
    conn = await pool.getConnection();
    
    // Testar consulta simples
    await conn.query("SELECT 1 as test");
    
    const endTime = Date.now();
    const responseTime = endTime - startTime;
    
    return {
      status: "healthy",
      responseTime: `${responseTime}ms`,
      timestamp: new Date().toISOString()
    };
  } catch (error) {
    console.error("[ERRO DB] Falha ao verificar saúde do banco de dados:", error);
    return {
      status: "unhealthy",
      error: error.message,
      timestamp: new Date().toISOString()
    };
  } finally {
    if (conn) conn.release();
  }
}

module.exports = {
  getClientByWhatsAppNumber,
  saveClient,
  updateClientField,
  updateClientLastInteraction,
  checkDatabaseHealth,
  validateWhatsAppNumber,
  validateName,
  validateAddress
};
