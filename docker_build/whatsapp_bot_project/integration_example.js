/**
 * Integração do Módulo de Persistência de Dados do Cliente
 * 
 * Este arquivo demonstra como integrar o módulo client_persistence.js
 * ao fluxo principal do bot WhatsApp.
 */

// Exemplo de como integrar o módulo ao arquivo index.js

// 1. Importar o módulo no início do arquivo
const clientPersistence = require('./client_persistence.js');

// 2. Substituir operações diretas de banco de dados por chamadas ao módulo

// Exemplo: Buscar cliente pelo número de WhatsApp
// Antes:
// const clientResult = await conn.query(
//   "SELECT id, name, address FROM clients WHERE whatsapp_number = ? LIMIT 1",
//   [senderNumber]
// );

// Depois:
try {
  const currentClient = await clientPersistence.getClientByWhatsAppNumber(senderNumber);
  if (currentClient) {
    console.log(`Cliente encontrado: ${currentClient.name}`);
    // Processar cliente existente
  } else {
    console.log("Cliente não encontrado, iniciando cadastro");
    // Iniciar fluxo de cadastro
  }
} catch (error) {
  console.error("Erro ao buscar cliente:", error.message);
  // Tratar erro apropriadamente
}

// Exemplo: Salvar novo cliente ou atualizar existente
// Antes:
// const insertResult = await conn.query(
//   "INSERT INTO clients (name, whatsapp_number, address) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE name = VALUES(name), address = VALUES(address)",
//   [stateInfo.data.name, senderNumber, stateInfo.data.address]
// );

// Depois:
try {
  const clientData = {
    whatsappNumber: senderNumber,
    name: stateInfo.data.name,
    address: stateInfo.data.address
  };
  
  const savedClient = await clientPersistence.saveClient(clientData);
  console.log(`Cliente ${savedClient.created ? 'criado' : 'atualizado'} com sucesso: ID ${savedClient.id}`);
  
  // Continuar fluxo após salvar cliente
} catch (error) {
  console.error("Erro ao salvar cliente:", error.message);
  // Informar ao usuário sobre o erro e como proceder
}

// Exemplo: Atualizar campo específico do cliente
// Antes:
// await conn.query(
//   `UPDATE clients SET ${fieldToUpdate} = ? WHERE id = ?`,
//   [newValue, stateInfo.data.clientId]
// );

// Depois:
try {
  const updateResult = await clientPersistence.updateClientField(
    stateInfo.data.clientId,
    'name', // ou 'address'
    stateInfo.data.newName // ou stateInfo.data.newAddress
  );
  
  console.log(`Campo ${updateResult.field} atualizado com sucesso para cliente ID ${updateResult.id}`);
  // Continuar fluxo após atualização
} catch (error) {
  console.error("Erro ao atualizar campo do cliente:", error.message);
  // Informar ao usuário sobre o erro e como proceder
}

// Exemplo: Atualizar tipo de última interação
// Antes:
// await conn.query(
//   "UPDATE clients SET last_interaction_type = ?, last_interaction_at = NOW() WHERE id = ?",
//   [interactionType, clientId]
// );

// Depois:
try {
  const interactionResult = await clientPersistence.updateClientLastInteraction(
    clientId,
    'Agendamento', // ou outro tipo de interação
    { appointmentId: appointmentResult.insertId } // dados adicionais específicos do tipo
  );
  
  console.log(`Última interação atualizada para ${interactionResult.interactionType}`);
  // Continuar fluxo após atualização
} catch (error) {
  console.error("Erro ao atualizar última interação:", error.message);
  // Tratar erro apropriadamente
}

// Exemplo: Verificar saúde do banco de dados
// Útil para diagnóstico e monitoramento
async function checkDatabaseStatus() {
  try {
    const healthStatus = await clientPersistence.checkDatabaseHealth();
    if (healthStatus.status === 'healthy') {
      console.log(`Banco de dados saudável. Tempo de resposta: ${healthStatus.responseTime}`);
      return true;
    } else {
      console.error(`Problema no banco de dados: ${healthStatus.error}`);
      return false;
    }
  } catch (error) {
    console.error("Erro ao verificar saúde do banco de dados:", error);
    return false;
  }
}
