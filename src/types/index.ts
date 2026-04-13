export type StatoProgetto = 'cliente_demo' | 'demo_accettata' | 'firmato' | 'completato' | 'archiviato'
export type PrioritaProgetto = 'alta' | 'media' | 'bassa'
export type StatoTask     = 'todo' | 'in_progress' | 'in_review' | 'done'
export type PrioritaTask  = 'bassa' | 'media' | 'alta' | 'urgente'
export type CategoriaTask =
  | 'sviluppo_frontend' | 'sviluppo_backend' | 'sviluppo_api' | 'sviluppo_ai'
  | 'design_ui' | 'design_ux' | 'design_componenti'
  | 'infra_hosting' | 'infra_database' | 'infra_deploy' | 'infra_dns'
  | 'security_auth' | 'security_authz' | 'security_test' | 'security_api'
  | 'analytics_tracking' | 'analytics_dashboard' | 'analytics_metriche'
  | 'docs_manuali' | 'docs_specifiche' | 'docs_guide'
export type StatoPagamentoContratto = 'da_fatturare' | 'parziale' | 'saldato'
export type CategoriaSpesa = 'software' | 'hardware' | 'servizi' | 'trasferta' | 'altro'
export type StatoFatturaEmessa   = 'bozza' | 'emessa' | 'pagata' | 'scaduta' | 'annullata'
export type StatoFatturaRicevuta = 'da_pagare' | 'pagata' | 'scaduta' | 'annullata'
export type MetodoPagamento      = 'bonifico' | 'contanti' | 'carta' | 'assegno' | 'riba' | 'altro'
export type CategoriaFatturaRicevuta = 'software' | 'hardware' | 'servizi' | 'consulenza' | 'affitto' | 'utenze' | 'altro'

export interface Cliente {
  id: string
  user_id: string
  nome: string
  partita_iva: string | null
  codice_fiscale: string | null
  codice_sdi: string | null
  pec: string | null
  indirizzo_sede: string | null
  cap: string | null
  citta: string | null
  provincia: string | null
  nazione: string | null
  sito_web: string | null
  settore: string | null
  email: string | null
  telefono: string | null
  note: string | null
  created_at: string
  updated_at: string
}

export interface Progetto {
  id: string
  user_id: string
  cliente_id: string | null
  nome: string
  descrizione: string | null
  stato: StatoProgetto
  data_inizio: string | null
  data_fine: string | null
  budget: number | null
  pagamento_mensile: number | null
  responsabile: string | null
  team: string[]
  priorita_progetto: PrioritaProgetto
  marginalita_stimata: number | null
  commerciale: string | null
  percentuale_commissione: number | null
  link_demo: string | null
  link_deploy: string | null
  spese_ricorrenti: Record<string, unknown>
  security_checklist: Record<string, unknown>
  legal_compliance: Record<string, unknown>
  team_membri: Record<string, unknown>
  created_at: string
  updated_at: string
  // join
  clienti?: { nome: string } | null
}

export interface LegalCheckItem {
  id: string
  label: string
  checked: boolean
  note: string
  required: boolean
}

export interface LegalSection {
  id: string
  title: string
  emoji: string
  items: LegalCheckItem[]
}

export interface LegalDocument {
  nome: string
  section_id: string
  storage_path: string
  tipo_file: string | null
  dimensione: number | null
  caricato_da: string
  caricato_il: string
}

export type RuoloTeam =
  | 'project_manager' | 'developer_frontend' | 'developer_backend' | 'developer_fullstack'
  | 'designer' | 'devops' | 'qa_tester' | 'data_analyst' | 'ai_specialist'
  | 'marketing' | 'legal' | 'account_manager' | 'altro'

export interface TeamMember {
  id: string
  nome: string
  cognome: string
  ruolo: RuoloTeam
  email: string
  telefono: string
  data_ingresso: string
  data_uscita: string | null
  tariffa_oraria: number | null
  note: string
  attivo: boolean
}

export type FrequenzaSpesa = 'mensile' | 'trimestrale' | 'semestrale' | 'annuale'

export interface SpesaRicorrente {
  id: string
  nome: string
  importo: number
  categoria: CategoriaSpesa
  frequenza: FrequenzaSpesa
  attiva: boolean
  data_inizio: string
  note: string
}

export interface ChecklistItem {
  testo: string
  completato: boolean
}

export interface TaskCommento {
  autore: string
  testo: string
  timestamp: string
}

export interface OrgMember {
  id: string
  email: string
  nome: string | null
  cognome: string | null
  ruolo: string | null
}

export interface Task {
  id: string
  user_id: string
  progetto_id: string | null
  titolo: string
  descrizione: string | null
  stato: StatoTask
  priorita: PrioritaTask
  scadenza: string | null
  categoria: CategoriaTask | null
  assegnatario: string | null
  dipendenza_id: string | null
  checklist: ChecklistItem[]
  commenti: TaskCommento[]
  partecipanti: string[]
  created_at: string
  updated_at: string
  // join
  progetti?: { nome: string } | null
}

export interface ProgettoAttivita {
  id: string
  progetto_id: string
  user_id: string
  utente: string
  azione: string
  dettaglio: string | null
  created_at: string
}

export interface ProgettoDocumento {
  id: string
  progetto_id: string
  user_id: string
  nome: string
  tipo_file: string | null
  url: string
  dimensione: number | null
  tags: string[]
  note: string | null
  caricato_da: string
  created_at: string
}

export interface ProgettoNota {
  id: string
  progetto_id: string
  user_id: string
  titolo: string
  contenuto: string | null
  autore: string
  created_at: string
  updated_at: string
}

export interface MilestoneItem {
  descrizione: string
  importo: number
  data: string
  stato: 'pending' | 'completato' | 'fatturato'
}

export interface ScadenzaFatturazione {
  data: string
  importo: number
  nota: string
}

export interface ContrattoDocumento {
  nome: string
  storage_path: string
  tipo_file: string | null
  dimensione: number | null
  caricato_da: string
  caricato_il: string
}

export interface ProgettoContratto {
  id: string
  progetto_id: string
  user_id: string
  valore_progetto: number | null
  setup_iniziale: number | null
  pagamento_mensile: number | null
  durata_mesi: number | null
  data_firma: string | null
  data_scadenza_contratto: string | null
  rinnovo_automatico: boolean
  preavviso_disdetta_giorni: number | null
  stato_pagamento: StatoPagamentoContratto
  metodo_pagamento: MetodoPagamento | null
  giorno_fatturazione: number | null
  milestone: MilestoneItem[]
  scadenze_fatturazione: ScadenzaFatturazione[]
  documenti: ContrattoDocumento[]
  note: string | null
  created_at: string
  updated_at: string
}

export interface TimeEntry {
  id: string
  user_id: string
  progetto_id: string | null
  task_id: string | null
  data: string
  ore: number
  nota: string | null
  created_at: string
  updated_at: string
  // join
  progetti?: { nome: string } | null
  task?: { titolo: string } | null
}

export interface Spesa {
  id: string
  user_id: string
  progetto_id: string | null
  data: string
  categoria: CategoriaSpesa
  importo: number
  descrizione: string
  created_at: string
  updated_at: string
  // join
  progetti?: { nome: string } | null
}

export interface FatturaEmessa {
  id: string
  cliente_id: string | null
  numero_fattura: string
  data_emissione: string
  data_scadenza: string | null
  imponibile: number
  aliquota_iva: number
  importo_iva: number
  totale: number
  stato: StatoFatturaEmessa
  metodo_pagamento: MetodoPagamento | null
  data_pagamento: string | null
  note: string | null
  user_id: string
  created_at: string
  // join
  clienti?: { nome: string } | null
}

export type StatoAbbonamento = 'attivo' | 'scaduto' | 'cancellato' | 'sospeso'
export type TipoAbbonamento  = 'mensile' | 'trimestrale' | 'semestrale' | 'annuale' | 'altro'
export type StatoIscrizione  = 'attiva' | 'scaduta' | 'cancellata'

export interface Abbonamento {
  id: string
  user_id: string
  cliente_id: string
  nome: string
  tipo: TipoAbbonamento
  importo: number
  data_inizio: string
  data_scadenza: string | null
  stato: StatoAbbonamento
  note: string | null
  created_at: string
  updated_at: string
}

export interface Iscrizione {
  id: string
  user_id: string
  cliente_id: string
  nome: string
  descrizione: string | null
  importo: number | null
  data_iscrizione: string
  data_scadenza: string | null
  stato: StatoIscrizione
  note: string | null
  created_at: string
  updated_at: string
}

export interface FatturaRicevuta {
  id: string
  fornitore: string
  fornitore_piva: string | null
  numero_fattura: string
  data_emissione: string
  data_scadenza: string | null
  imponibile: number
  aliquota_iva: number
  importo_iva: number
  totale: number
  stato: StatoFatturaRicevuta
  metodo_pagamento: MetodoPagamento | null
  data_pagamento: string | null
  categoria: CategoriaFatturaRicevuta
  note: string | null
  user_id: string
  created_at: string
}

export interface UserProfile {
  id: string
  user_id: string
  nome: string | null
  cognome: string | null
  telefono: string | null
  ruolo: string | null
  azienda: string | null
  partita_iva: string | null
  created_at: string
  updated_at: string
}

export interface AccessLogEntry {
  id: string
  user_id: string
  logged_in_at: string
  ip_address: string | null
  user_agent: string | null
  created_at: string
}

export type TipoCredenziale = 'account' | 'api_key' | 'database' | 'server' | 'certificato' | 'altro'

export interface ProgettoCredenziale {
  id: string
  progetto_id: string
  user_id: string
  nome: string
  tipo: TipoCredenziale
  url: string | null
  username: string | null
  password_encrypted: string | null
  api_key: string | null
  note: string | null
  created_at: string
  updated_at: string
}
