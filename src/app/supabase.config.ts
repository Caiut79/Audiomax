export const supabaseConfig = {
  url: 'https://xcwzjjxzazoummpezrdx.supabase.co',
  publishableKey: 'sb_publishable_ZqHEyRxNUSCJg5WpPNKoCw_Ja7MmyAF',
  tables: {
    clients: 'crm_clients',
    quotes: 'crm_quotes',
    appointments: 'crm_appointments',
    inventoryItems: 'crm_inventory_items',
    cashProducts: 'crm_cash_products',
    cashTransactions: 'crm_cash_transactions',
    cashShifts: 'crm_cash_shifts',
    serviceTickets: 'crm_service_tickets',
    cashOperators: 'crm_cash_operators',
    // ===== Portale Dipendenti v1 =====
    warehouseDdts: 'crm_ep_warehouse_ddts',
    pendingServices: 'crm_ep_pending_services',
    warehouseOrders: 'crm_ep_warehouse_orders',
    // ===== Portale Dipendenti v2 =====
    portalCommunications: 'crm_ep_portal_communications',
  },
  remoteSyncEnabled: {
    // Tutte le tabelle opzionali del portale sono ora presenti su Supabase.
    // La sincronizzazione remota puo quindi restare attiva anche per queste sezioni.
    cashOperators: true,
    warehouseDdts: true,
    pendingServices: true,
    warehouseOrders: true,
    portalCommunications: true,
  },
};
